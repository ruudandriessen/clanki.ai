import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Sandbox } from "@cloudflare/sandbox";
import type { AppDb } from "../db/client";
import { getDb } from "../db/client";
import { withTransaction, withTxid } from "../db/transaction";
import * as schema from "../db/schema";
import { clauseToString } from "../lib/clause-to-string";
import { electricFn } from "../lib/electric";
import {
  DEFAULT_OPENCODE_MODEL,
  DEFAULT_OPENCODE_PROVIDER,
  isSupportedOpencodeProvider,
} from "../lib/opencode";
import { openTaskEventsSse } from "../lib/durable-streams";
import { executeTaskRun } from "../lib/task-runs";

type Env = {
  Bindings: {
    HYPERDRIVE: Hyperdrive;
    Sandbox: DurableObjectNamespace<Sandbox>;
    GITHUB_APP_ID?: string;
    GITHUB_APP_PRIVATE_KEY?: string;
    CREDENTIALS_ENCRYPTION_KEY: string;
    DURABLE_STREAMS_SERVICE_ID?: string;
    DURABLE_STREAMS_SECRET?: string;
  };
  Variables: {
    db: AppDb;
    session: {
      session: { userId: string; activeOrganizationId?: string | null };
      user: { id: string; name: string; email: string; image?: string | null };
    };
  };
};

const tasks = new Hono<Env>();

function getOrgId(c: { get: (key: "session") => Env["Variables"]["session"] }): string | null {
  const session = c.get("session");
  return (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;
}

function getUserId(c: { get: (key: "session") => Env["Variables"]["session"] }): string {
  return c.get("session").user.id;
}

function parseOptionalId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseOptionalTimestamp(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  if (value < 0) {
    return undefined;
  }

  return Math.trunc(value);
}

function isValidStreamOffset(value: string): boolean {
  if (value === "-1" || value === "now") {
    return true;
  }

  if (value.length === 0 || value.length > 512) {
    return false;
  }

  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if ((code >= 0 && code <= 31) || code === 127) {
      return false;
    }
  }

  return true;
}

async function getTaskForOrg(
  db: AppDb,
  taskId: string,
  orgId: string,
): Promise<{ id: string; title: string; projectId: string | null } | undefined> {
  return db.query.tasks.findFirst({
    where: and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, orgId)),
    columns: { id: true, title: true, projectId: true },
  });
}

async function getLatestTaskMessageTimestamp(db: AppDb, taskId: string): Promise<number | null> {
  const latest = await db.query.taskMessages.findFirst({
    where: eq(schema.taskMessages.taskId, taskId),
    columns: { createdAt: true },
    orderBy: desc(schema.taskMessages.createdAt),
  });

  return latest?.createdAt ?? null;
}

tasks.get("/shape", async (c) => {
  const orgId = getOrgId(c);

  if (!orgId) {
    return c.json({ error: "No active organization" }, 400);
  }

  return electricFn({
    request: c.req.raw,
    table: "tasks",
    where: clauseToString(eq(schema.tasks.organizationId, orgId)),
  });
});

// POST /api/tasks — create a new task
tasks.post("/", async (c) => {
  const db = c.get("db");
  const orgId = getOrgId(c);

  if (!orgId) {
    return c.json({ error: "No active organization" }, 400);
  }

  let body: {
    id?: string;
    title: string;
    projectId: string;
    status?: string;
    createdAt?: number;
    updatedAt?: number;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.title || typeof body.title !== "string" || body.title.trim().length === 0) {
    return c.json({ error: "title is required" }, 400);
  }

  if (!body.projectId || typeof body.projectId !== "string") {
    return c.json({ error: "projectId is required" }, 400);
  }

  const project = await db.query.projects.findFirst({
    where: and(eq(schema.projects.id, body.projectId), eq(schema.projects.organizationId, orgId)),
    columns: { id: true },
  });

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const result = await withTransaction(db, async (tx, txid) => {
    const now = Date.now();
    const createdAt = parseOptionalTimestamp(body.createdAt) ?? now;
    const updatedAt = parseOptionalTimestamp(body.updatedAt) ?? createdAt;
    const status =
      typeof body.status === "string" && body.status.trim().length > 0
        ? body.status.trim()
        : "open";
    const task = {
      id: parseOptionalId(body.id) ?? crypto.randomUUID(),
      organizationId: orgId,
      projectId: body.projectId,
      title: body.title.trim(),
      status,
      createdAt,
      updatedAt,
    };

    await tx.insert(schema.tasks).values(task);
    return { task, txid };
  });

  return withTxid(c.json(result.task, 201), result.txid);
});

// PATCH /api/tasks/:taskId — update task fields
tasks.patch("/:taskId", async (c) => {
  const db = c.get("db");
  const { taskId } = c.req.param();
  const orgId = getOrgId(c);

  if (!orgId) {
    return c.json({ error: "No active organization" }, 400);
  }

  const task = await getTaskForOrg(db, taskId, orgId);
  if (!task) {
    return c.json({ error: "Task not found" }, 404);
  }

  let body: { title?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (typeof body.title !== "string" || body.title.trim().length === 0) {
    return c.json({ error: "title is required" }, 400);
  }

  const result = await withTransaction(db, async (tx, txid) => {
    const updatedAt = Date.now();
    await tx
      .update(schema.tasks)
      .set({ title: body.title?.trim(), updatedAt })
      .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, orgId)));

    const updatedTask = await tx.query.tasks.findFirst({
      where: and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, orgId)),
    });

    if (!updatedTask) {
      return { notFound: true as const };
    }

    return { updatedTask, txid };
  });

  if ("notFound" in result) {
    return c.json({ error: "Task not found" }, 404);
  }

  return withTxid(c.json(result.updatedTask), result.txid);
});

// DELETE /api/tasks/:taskId — delete a task
tasks.delete("/:taskId", async (c) => {
  const db = c.get("db");
  const { taskId } = c.req.param();
  const orgId = getOrgId(c);

  if (!orgId) {
    return c.json({ error: "No active organization" }, 400);
  }

  const task = await getTaskForOrg(db, taskId, orgId);
  if (!task) {
    return c.json({ error: "Task not found" }, 404);
  }

  const txid = await withTransaction(db, async (tx, txid) => {
    await tx
      .delete(schema.tasks)
      .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, orgId)));

    return txid;
  });

  return withTxid(new Response(null, { status: 204 }), txid);
});

tasks.get("/messages/shape", async (c) => {
  const orgId = getOrgId(c);

  if (!orgId) {
    return c.json({ error: "No active organization" }, 400);
  }

  const result = await electricFn({
    request: c.req.raw,
    table: "task_messages",
    where: clauseToString(eq(schema.taskMessages.organizationId, orgId)),
  });

  return result;
});

// POST /api/tasks/:taskId/messages — add a message
tasks.post("/:taskId/messages", async (c) => {
  const db = c.get("db");
  const { taskId } = c.req.param();
  const orgId = getOrgId(c);

  if (!orgId) {
    return c.json({ error: "No active organization" }, 400);
  }

  const task = await getTaskForOrg(db, taskId, orgId);
  if (!task) {
    return c.json({ error: "Task not found" }, 404);
  }

  let body: { id?: string; role: string; content: string; createdAt?: number };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.content || typeof body.content !== "string" || body.content.trim().length === 0) {
    return c.json({ error: "content is required" }, 400);
  }

  if (!body.role || !["user", "assistant"].includes(body.role)) {
    return c.json({ error: "role must be 'user' or 'assistant'" }, 400);
  }

  const result = await withTransaction(db, async (tx, txid) => {
    const requestedCreatedAt = parseOptionalTimestamp(body.createdAt) ?? Date.now();
    const latestCreatedAt = await getLatestTaskMessageTimestamp(tx as unknown as AppDb, taskId);
    const createdAt =
      latestCreatedAt !== null && latestCreatedAt >= requestedCreatedAt
        ? latestCreatedAt + 1
        : requestedCreatedAt;

    const message = {
      id: parseOptionalId(body.id) ?? crypto.randomUUID(),
      organizationId: orgId,
      taskId,
      role: body.role,
      content: body.content.trim(),
      createdAt,
    };

    await tx.insert(schema.taskMessages).values(message);

    // Update task's updatedAt
    await tx.update(schema.tasks).set({ updatedAt: createdAt }).where(eq(schema.tasks.id, taskId));

    return { message, txid };
  });

  return withTxid(c.json(result.message, 201), result.txid);
});

// GET /api/tasks/:taskId/stream — live durable stream for task events
tasks.get("/:taskId/stream", async (c) => {
  const db = c.get("db");
  const { taskId } = c.req.param();
  const orgId = getOrgId(c);

  if (!orgId) {
    return c.json({ error: "No active organization" }, 400);
  }

  const task = await getTaskForOrg(db, taskId, orgId);
  if (!task) {
    return c.json({ error: "Task not found" }, 404);
  }

  const offset = c.req.query("offset")?.trim() ?? "-1";
  if (!isValidStreamOffset(offset)) {
    return c.json({ error: "offset must be -1, now, or a durable stream offset" }, 400);
  }

  try {
    const upstream = await openTaskEventsSse({
      env: c.env,
      organizationId: orgId,
      taskId,
      offset,
    });

    if (!upstream.ok || !upstream.body) {
      const details = (await upstream.text()).trim();
      const status: 400 | 404 | 502 =
        upstream.status === 404 ? 404 : upstream.status >= 400 && upstream.status < 500 ? 400 : 502;
      return c.json(
        {
          error: `Failed to open durable task stream (${upstream.status} ${upstream.statusText})${
            details.length > 0 ? `: ${details}` : ""
          }`,
        },
        status,
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Failed to connect to durable stream",
      },
      502,
    );
  }
});

// POST /api/tasks/:taskId/runs — create an OpenCode run from a user message
tasks.post("/:taskId/runs", async (c) => {
  const db = c.get("db");
  const { taskId } = c.req.param();
  const orgId = getOrgId(c);
  const userId = getUserId(c);

  try {
    if (!orgId) {
      return c.json({ error: "No active organization" }, 400);
    }

    const task = await getTaskForOrg(db, taskId, orgId);
    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    let body: { messageId?: string; provider?: string; model?: string };
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }

    const requestedProvider = body.provider?.trim().toLowerCase() ?? "";
    const providerInput =
      requestedProvider.length > 0 ? requestedProvider : DEFAULT_OPENCODE_PROVIDER;
    if (!isSupportedOpencodeProvider(providerInput)) {
      return c.json({ error: `Unsupported provider: ${providerInput}` }, 400);
    }

    const model = body.model?.trim() ?? DEFAULT_OPENCODE_MODEL;
    if (model.length === 0) {
      return c.json({ error: "model is required" }, 400);
    }

    const hasCredential = await db.query.userProviderCredentials.findFirst({
      where: and(
        eq(schema.userProviderCredentials.userId, userId),
        eq(schema.userProviderCredentials.provider, providerInput),
      ),
      columns: { id: true },
    });
    if (!hasCredential) {
      return c.json({ error: `No ${providerInput} credentials configured in Settings` }, 400);
    }

    const inputMessage = body.messageId
      ? await db.query.taskMessages.findFirst({
          where: and(
            eq(schema.taskMessages.id, body.messageId),
            eq(schema.taskMessages.taskId, taskId),
            eq(schema.taskMessages.role, "user"),
          ),
        })
      : await db.query.taskMessages.findFirst({
          where: and(eq(schema.taskMessages.taskId, taskId), eq(schema.taskMessages.role, "user")),
          orderBy: desc(schema.taskMessages.createdAt),
        });

    if (!inputMessage) {
      return c.json({ error: "No user message found for this task" }, 400);
    }

    const now = Date.now();
    const run = {
      id: crypto.randomUUID(),
      taskId,
      tool: "opencode",
      status: "queued",
      inputMessageId: inputMessage.id,
      outputMessageId: null,
      sandboxId: null,
      sessionId: null,
      initiatedByUserId: userId,
      provider: providerInput,
      model,
      error: null,
      startedAt: null,
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(schema.taskRuns).values(run);
    await db
      .update(schema.tasks)
      .set({ status: "running", updatedAt: now })
      .where(eq(schema.tasks.id, taskId));

    const project = task.projectId
      ? await db.query.projects.findFirst({
          where: and(
            eq(schema.projects.id, task.projectId),
            eq(schema.projects.organizationId, orgId),
          ),
          columns: { repoUrl: true, installationId: true, setupCommand: true },
        })
      : null;

    if (!project?.repoUrl) {
      return c.json({ error: "Task's project has no repository URL configured" }, 400);
    }

    c.executionCtx.waitUntil(
      executeTaskRun({
        db: getDb(c.env),
        env: c.env,
        runId: run.id,
        taskId,
        taskTitle: task.title,
        prompt: inputMessage.content,
        repoUrl: project.repoUrl,
        installationId: project.installationId ?? null,
        setupCommand: project.setupCommand ?? null,
        initiatedByUserId: userId,
        organizationId: orgId,
        provider: providerInput,
        model,
      }),
    );

    return c.json(run, 202);
  } catch (error) {
    const message = getErrorMessage(error);
    console.error("Failed to create task run", {
      taskId,
      userId,
      message,
    });
    return c.json({ error: message }, 500);
  }
});

export { tasks };

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Failed to create task run";
}

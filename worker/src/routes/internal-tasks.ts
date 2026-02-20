import { Hono } from "hono";
import type { Sandbox } from "@cloudflare/sandbox";
import { and, eq } from "drizzle-orm";
import type { AppDb } from "../db/client";
import * as schema from "../db/schema";
import type { TaskRunner } from "../lib/task-runner";
import {
  completeTask,
  insertAssistantTaskMessage,
  markTaskFailed,
} from "../lib/task-execution/helpers";
import { upsertProviderAuthCredential } from "../lib/provider-credentials";
import type { SupportedOpencodeProvider } from "../lib/opencode";
import { isSupportedOpencodeProvider } from "../lib/opencode";

type Env = {
  Bindings: {
    HYPERDRIVE: Hyperdrive;
    CREDENTIALS_ENCRYPTION_KEY: string;
    DURABLE_STREAMS_SERVICE_ID?: string;
    DURABLE_STREAMS_SECRET?: string;
    Sandbox: DurableObjectNamespace<Sandbox>;
    TaskRunner: DurableObjectNamespace<TaskRunner>;
  };
  Variables: {
    db: AppDb;
  };
};

const internalTasks = new Hono<Env>();

/** Middleware: extract callback token from Authorization header. */
function getCallbackToken(c: {
  req: { header: (name: string) => string | undefined };
}): string | null {
  const header = c.req.header("authorization");
  if (!header) {
    return null;
  }

  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return null;
  }

  const token = parts[1]?.trim();
  return token && token.length > 0 ? token : null;
}

function getRunner(env: Env["Bindings"], executionId: string): DurableObjectStub<TaskRunner> {
  const id = env.TaskRunner.idFromName(executionId);
  return env.TaskRunner.get(id);
}

// POST /api/internal/task-runs/:executionId/heartbeat
internalTasks.post("/task-runs/:executionId/heartbeat", async (c) => {
  const token = getCallbackToken(c);
  if (!token) {
    return c.json({ error: "Missing callback token" }, 401);
  }

  const { executionId } = c.req.param();
  const runner = getRunner(c.env, executionId);

  try {
    const ok = await runner.recordHeartbeat(token);
    if (!ok) {
      return c.json({ error: "Invalid callback token" }, 401);
    }
    return c.json({ ok: true });
  } catch {
    return c.json({ error: "Failed to record heartbeat" }, 500);
  }
});

// POST /api/internal/task-runs/:executionId/branch
internalTasks.post("/task-runs/:executionId/branch", async (c) => {
  const token = getCallbackToken(c);
  if (!token) {
    return c.json({ error: "Missing callback token" }, 401);
  }

  const { executionId } = c.req.param();
  const runner = getRunner(c.env, executionId);

  const context = await runner.verifyToken(token);
  if (!context) {
    return c.json({ error: "Invalid callback token" }, 401);
  }

  let body: { branch?: string | null };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  let branch: string | null = null;
  if (body.branch !== null && body.branch !== undefined) {
    if (typeof body.branch !== "string") {
      return c.json({ error: "branch must be a string or null" }, 400);
    }

    const normalizedBranch = body.branch.trim();
    if (normalizedBranch.length > 255) {
      return c.json({ error: "branch must be at most 255 characters" }, 400);
    }

    branch = normalizedBranch.length > 0 ? normalizedBranch : null;
  }

  const db = c.get("db");
  await db
    .update(schema.tasks)
    .set({ branch, updatedAt: Date.now() })
    .where(
      and(
        eq(schema.tasks.id, context.taskId),
        eq(schema.tasks.organizationId, context.organizationId),
      ),
    );

  return c.json({ ok: true });
});

// POST /api/internal/task-runs/:executionId/complete
internalTasks.post("/task-runs/:executionId/complete", async (c) => {
  const token = getCallbackToken(c);
  if (!token) {
    return c.json({ error: "Missing callback token" }, 401);
  }

  const { executionId } = c.req.param();
  const runner = getRunner(c.env, executionId);

  const context = await runner.verifyToken(token);
  if (!context) {
    return c.json({ error: "Invalid callback token" }, 401);
  }

  let body: {
    assistantOutput?: string;
    refreshedAuth?: { provider?: string; auth?: unknown };
  };
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const db = c.get("db");

  // Persist assistant output as a fallback message if provided.
  if (
    body.assistantOutput &&
    typeof body.assistantOutput === "string" &&
    body.assistantOutput.trim().length > 0
  ) {
    try {
      await insertAssistantTaskMessage({
        db,
        organizationId: context.organizationId,
        taskId: context.taskId,
        content: body.assistantOutput.trim(),
      });
    } catch (error) {
      console.warn("Failed to persist assistant output on complete callback", {
        executionId,
        taskId: context.taskId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Persist refreshed provider auth if provided.
  if (body.refreshedAuth?.provider && body.refreshedAuth.auth) {
    const provider = String(body.refreshedAuth.provider);
    if (isSupportedOpencodeProvider(provider)) {
      try {
        await upsertProviderAuthCredential(
          db,
          c.env,
          context.userId,
          provider as SupportedOpencodeProvider,
          body.refreshedAuth.auth as Parameters<typeof upsertProviderAuthCredential>[4],
        );
      } catch {}
    }
  }

  await completeTask({ db, taskId: context.taskId });
  await runner.clearCallback();

  return c.json({ ok: true });
});

// POST /api/internal/task-runs/:executionId/fail
internalTasks.post("/task-runs/:executionId/fail", async (c) => {
  const token = getCallbackToken(c);
  if (!token) {
    return c.json({ error: "Missing callback token" }, 401);
  }

  const { executionId } = c.req.param();
  const runner = getRunner(c.env, executionId);

  const context = await runner.verifyToken(token);
  if (!context) {
    return c.json({ error: "Invalid callback token" }, 401);
  }

  let body: { error?: string };
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const errorMessage =
    typeof body.error === "string" && body.error.trim().length > 0
      ? body.error.trim()
      : "Task failed (reported by sandbox)";

  const db = c.get("db");
  await markTaskFailed({ db, taskId: context.taskId, message: errorMessage });
  await runner.clearCallback();

  return c.json({ ok: true });
});

// POST /api/internal/task-runs/:executionId/message
internalTasks.post("/task-runs/:executionId/message", async (c) => {
  const token = getCallbackToken(c);
  if (!token) {
    return c.json({ error: "Missing callback token" }, 401);
  }

  const { executionId } = c.req.param();
  const runner = getRunner(c.env, executionId);

  const context = await runner.verifyToken(token);
  if (!context) {
    return c.json({ error: "Invalid callback token" }, 401);
  }

  let body: { content?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.content || typeof body.content !== "string" || body.content.trim().length === 0) {
    return c.json({ error: "content is required" }, 400);
  }

  const db = c.get("db");

  const taskMessageId = await insertAssistantTaskMessage({
    db,
    organizationId: context.organizationId,
    taskId: context.taskId,
    content: body.content.trim(),
  });

  return c.json({ id: taskMessageId }, 201);
});

export { internalTasks };

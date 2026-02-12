import { Hono } from "hono";
import { and, desc, eq, gt } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { executeTaskRun } from "../lib/task-runs";

type Env = {
  Bindings: {
    OPENCODE_BASE_URL?: string;
    OPENCODE_SERVER_PASSWORD?: string;
    OPENCODE_SERVER_USERNAME?: string;
    OPENCODE_MODEL?: string;
  };
  Variables: {
    db: DrizzleD1Database<typeof schema>;
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

async function getTaskForOrg(
  db: DrizzleD1Database<typeof schema>,
  taskId: string,
  orgId: string,
): Promise<{ id: string; title: string } | undefined> {
  return db.query.tasks.findFirst({
    where: and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, orgId)),
    columns: { id: true, title: true },
  });
}

async function ensureRunForOrg(
  db: DrizzleD1Database<typeof schema>,
  orgId: string,
  runId: string,
): Promise<{ id: string; taskId: string } | undefined> {
  const run = await db.query.taskRuns.findFirst({
    where: eq(schema.taskRuns.id, runId),
    columns: { id: true, taskId: true },
  });

  if (!run) {
    return undefined;
  }

  const task = await db.query.tasks.findFirst({
    where: and(eq(schema.tasks.id, run.taskId), eq(schema.tasks.organizationId, orgId)),
    columns: { id: true },
  });

  if (!task) {
    return undefined;
  }

  return run;
}

// GET /api/tasks — list tasks for the active organization
tasks.get("/", async (c) => {
  const db = c.get("db");
  const orgId = getOrgId(c);

  if (!orgId) {
    return c.json({ error: "No active organization" }, 400);
  }

  const rows = await db.query.tasks.findMany({
    where: eq(schema.tasks.organizationId, orgId),
    orderBy: desc(schema.tasks.updatedAt),
  });
  return c.json(rows);
});

// POST /api/tasks — create a new task
tasks.post("/", async (c) => {
  const db = c.get("db");
  const orgId = getOrgId(c);

  if (!orgId) {
    return c.json({ error: "No active organization" }, 400);
  }

  let body: { title: string; projectId?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.title || typeof body.title !== "string" || body.title.trim().length === 0) {
    return c.json({ error: "title is required" }, 400);
  }

  const now = Date.now();
  const task = {
    id: crypto.randomUUID(),
    organizationId: orgId,
    projectId: body.projectId ?? null,
    title: body.title.trim(),
    status: "open",
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(schema.tasks).values(task);
  return c.json(task, 201);
});

// GET /api/tasks/:taskId — single task
tasks.get("/:taskId", async (c) => {
  const db = c.get("db");
  const { taskId } = c.req.param();
  const orgId = getOrgId(c);

  if (!orgId) {
    return c.json({ error: "No active organization" }, 400);
  }

  const task = await db.query.tasks.findFirst({
    where: and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, orgId)),
  });

  if (!task) {
    return c.json({ error: "Task not found" }, 404);
  }

  return c.json(task);
});

// GET /api/tasks/:taskId/messages — list messages for a task
tasks.get("/:taskId/messages", async (c) => {
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

  const rows = await db.query.taskMessages.findMany({
    where: eq(schema.taskMessages.taskId, taskId),
    orderBy: schema.taskMessages.createdAt,
  });
  return c.json(rows);
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

  let body: { role: string; content: string };
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

  const now = Date.now();
  const message = {
    id: crypto.randomUUID(),
    taskId,
    role: body.role,
    content: body.content.trim(),
    createdAt: now,
  };

  await db.insert(schema.taskMessages).values(message);

  // Update task's updatedAt
  await db.update(schema.tasks).set({ updatedAt: now }).where(eq(schema.tasks.id, taskId));

  return c.json(message, 201);
});

// GET /api/tasks/:taskId/runs — list runs for a task
tasks.get("/:taskId/runs", async (c) => {
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

  const runs = await db.query.taskRuns.findMany({
    where: eq(schema.taskRuns.taskId, taskId),
    orderBy: desc(schema.taskRuns.createdAt),
  });

  return c.json(runs);
});

// POST /api/tasks/:taskId/runs — create an OpenCode run from a user message
tasks.post("/:taskId/runs", async (c) => {
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

  let body: { messageId?: string };
  try {
    body = await c.req.json();
  } catch {
    body = {};
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
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(schema.taskRuns).values(run);
  await db.insert(schema.taskRunEvents).values({
    id: crypto.randomUUID(),
    runId: run.id,
    kind: "status",
    payload: "queued",
    createdAt: now,
  });

  c.executionCtx.waitUntil(
    executeTaskRun({
      db,
      env: c.env,
      runId: run.id,
      taskId,
      taskTitle: task.title,
      prompt: inputMessage.content,
    }),
  );

  return c.json(run, 202);
});

// GET /api/tasks/runs/:runId — single run
tasks.get("/runs/:runId", async (c) => {
  const db = c.get("db");
  const { runId } = c.req.param();
  const orgId = getOrgId(c);

  if (!orgId) {
    return c.json({ error: "No active organization" }, 400);
  }

  const runRef = await ensureRunForOrg(db, orgId, runId);
  if (!runRef) {
    return c.json({ error: "Run not found" }, 404);
  }

  const run = await db.query.taskRuns.findFirst({
    where: eq(schema.taskRuns.id, runRef.id),
  });

  if (!run) {
    return c.json({ error: "Run not found" }, 404);
  }

  return c.json(run);
});

// GET /api/tasks/runs/:runId/events — run events (optionally after timestamp)
tasks.get("/runs/:runId/events", async (c) => {
  const db = c.get("db");
  const { runId } = c.req.param();
  const orgId = getOrgId(c);

  if (!orgId) {
    return c.json({ error: "No active organization" }, 400);
  }

  const runRef = await ensureRunForOrg(db, orgId, runId);
  if (!runRef) {
    return c.json({ error: "Run not found" }, 404);
  }

  const afterParam = c.req.query("after");
  const hasAfter = typeof afterParam === "string" && afterParam.length > 0;
  const after = hasAfter ? Number(afterParam) : null;

  if (hasAfter && (!Number.isFinite(after) || after === null)) {
    return c.json({ error: "after must be a number" }, 400);
  }

  const whereClause =
    after === null
      ? eq(schema.taskRunEvents.runId, runRef.id)
      : and(eq(schema.taskRunEvents.runId, runRef.id), gt(schema.taskRunEvents.createdAt, after));

  const events = await db.query.taskRunEvents.findMany({
    where: whereClause,
    orderBy: schema.taskRunEvents.createdAt,
  });

  return c.json(events);
});

export { tasks };

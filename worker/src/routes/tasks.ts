import { Hono } from "hono";
import { eq, desc, and } from "drizzle-orm";
import * as schema from "../db/schema";
import type { DrizzleD1Database } from "drizzle-orm/d1";

type Env = {
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

  // Verify task belongs to org
  const task = await db.query.tasks.findFirst({
    where: and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, orgId)),
    columns: { id: true },
  });

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

  // Verify task belongs to org
  const task = await db.query.tasks.findFirst({
    where: and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, orgId)),
    columns: { id: true },
  });

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

export { tasks };

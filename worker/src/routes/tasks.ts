import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppDb } from "../db/client";
import * as schema from "../db/schema";
import { clauseToString } from "../lib/clause-to-string";
import { electricFn } from "../lib/electric";
import { openTaskEventsSse } from "../lib/durable-streams";

type Env = {
  Bindings: {
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
): Promise<{ id: string; title: string; projectId: string | null; streamId: string } | undefined> {
  return db.query.tasks.findFirst({
    where: and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, orgId)),
    columns: { id: true, title: true, projectId: true, streamId: true },
  });
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
      streamId: task.streamId,
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

export { tasks };

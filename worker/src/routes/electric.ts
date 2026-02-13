import { ELECTRIC_PROTOCOL_QUERY_PARAMS } from "@electric-sql/client";
import { and, eq } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { Hono } from "hono";
import type { AppDb } from "../db/client";
import * as schema from "../db/schema";
import { clauseToString } from "../lib/clause-to-string";

type Env = {
  Bindings: {
    ELECTRIC_URL: string;
    ELECTRIC_SOURCE_ID?: string;
    ELECTRIC_SOURCE_SECRET?: string;
  };
  Variables: {
    db: AppDb;
    session: {
      session: { userId: string; activeOrganizationId?: string | null };
      user: { id: string; name: string; email: string; image?: string | null };
    };
  };
};

const electric = new Hono<Env>();

const FORWARDED_PARAMS = new Set(ELECTRIC_PROTOCOL_QUERY_PARAMS);

function getOrgId(c: { get: (key: "session") => Env["Variables"]["session"] }): string | null {
  const session = c.get("session");
  return (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;
}

function buildUpstreamUrl(c: { env: Env["Bindings"]; req: { url: string } }): URL {
  const upstream = new URL("/v1/shape", c.env.ELECTRIC_URL);
  const incoming = new URL(c.req.url);

  for (const [key, value] of incoming.searchParams) {
    if (FORWARDED_PARAMS.has(key)) {
      upstream.searchParams.append(key, value);
    }
  }

  if (c.env.ELECTRIC_SOURCE_ID) {
    upstream.searchParams.set("source_id", c.env.ELECTRIC_SOURCE_ID);
  }
  if (c.env.ELECTRIC_SOURCE_SECRET) {
    upstream.searchParams.set("source_secret", c.env.ELECTRIC_SOURCE_SECRET);
  }

  return upstream;
}

function shapeResponse(upstreamResponse: Response): Response {
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: upstreamResponse.headers,
  });
}

async function proxyShape(
  c: {
    env: Env["Bindings"];
    req: {
      method: string;
      url: string;
      header: (name: string) => string | undefined;
      raw: Request;
    };
  },
  opts: {
    table: string;
    where?: SQL;
  },
): Promise<Response> {
  const upstream = buildUpstreamUrl(c);

  upstream.searchParams.set("table", opts.table);
  if (opts.where) {
    upstream.searchParams.set("where", clauseToString(opts.where));
  }

  const headers = new Headers();
  const accept = c.req.header("accept");
  if (accept) {
    headers.set("accept", accept);
  }

  const contentType = c.req.header("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  const upstreamResponse = await fetch(upstream.toString(), {
    method: c.req.method,
    headers,
    body: c.req.method === "POST" ? await c.req.raw.text() : undefined,
  });

  return shapeResponse(upstreamResponse);
}

electric.on(["GET", "POST"], "/projects", async (c) => {
  const orgId = getOrgId(c);
  if (!orgId) {
    return c.json({ error: "No active organization" }, 400);
  }

  return proxyShape(c, {
    table: "projects",
    where: eq(schema.projects.organizationId, orgId),
  });
});

electric.on(["GET", "POST"], "/tasks", async (c) => {
  const orgId = getOrgId(c);
  if (!orgId) {
    return c.json({ error: "No active organization" }, 400);
  }

  return proxyShape(c, {
    table: "tasks",
    where: eq(schema.tasks.organizationId, orgId),
  });
});

electric.on(["GET", "POST"], "/tasks/:taskId/messages", async (c) => {
  const db = c.get("db");
  const orgId = getOrgId(c);

  if (!orgId) {
    return c.json({ error: "No active organization" }, 400);
  }

  const { taskId } = c.req.param();
  const task = await db.query.tasks.findFirst({
    where: and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, orgId)),
    columns: { id: true },
  });

  if (!task) {
    return c.json({ error: "Task not found" }, 404);
  }

  return proxyShape(c, {
    table: "task_messages",
    where: eq(schema.taskMessages.taskId, taskId),
  });
});

export { electric };

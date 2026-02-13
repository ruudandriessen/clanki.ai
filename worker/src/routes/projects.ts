import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { AppDb } from "../db/client";
import * as schema from "../db/schema";

type Env = {
  Variables: {
    db: AppDb;
    session: {
      session: { userId: string; activeOrganizationId?: string | null };
      user: { id: string; name: string; email: string; image?: string | null };
    };
  };
};

const projects = new Hono<Env>();

function getOrgId(c: { get: (key: "session") => Env["Variables"]["session"] }): string | null {
  const session = c.get("session");
  return (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;
}

function withTxid(response: Response, txid: number): Response {
  response.headers.set("x-electric-txid", String(txid));
  return response;
}

async function getCurrentTxid(executor: {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
}) {
  const result = (await executor.execute(
    sql<{ txid: string }>`select pg_current_xact_id()::text as txid`,
  )) as { rows: Array<{ txid: string }> };
  const txid = Number(result.rows[0]?.txid);
  if (!Number.isFinite(txid)) {
    throw new Error("Failed to resolve postgres txid");
  }
  return txid;
}

// GET /api/projects — list projects for the active organization
projects.get("/", async (c) => {
  const db = c.get("db");
  const orgId = getOrgId(c);

  if (!orgId) {
    return c.json({ error: "No active organization" }, 400);
  }

  const rows = await db.query.projects.findMany({
    where: eq(schema.projects.organizationId, orgId),
    orderBy: desc(schema.projects.createdAt),
  });
  return c.json(rows);
});

// GET /api/projects/:projectId — single project
projects.get("/:projectId", async (c) => {
  const db = c.get("db");
  const { projectId } = c.req.param();
  const orgId = getOrgId(c);

  if (!orgId) {
    return c.json({ error: "No active organization" }, 400);
  }

  const project = await db.query.projects.findFirst({
    where: and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, orgId)),
  });

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  return c.json(project);
});

// POST /api/projects — create project(s) from selected repos
projects.post("/", async (c) => {
  const db = c.get("db");
  const orgId = getOrgId(c);

  if (!orgId) {
    return c.json({ error: "No active organization" }, 400);
  }

  let body: {
    repos: Array<{ name: string; repoUrl: string; installationId: number }>;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.repos || !Array.isArray(body.repos) || body.repos.length === 0) {
    return c.json({ error: "repos array is required and must not be empty" }, 400);
  }

  for (const repo of body.repos) {
    if (!repo.name || !repo.repoUrl || !repo.installationId) {
      return c.json({ error: "Each repo must have name, repoUrl, and installationId" }, 400);
    }
  }

  const result = await db.transaction(async (tx) => {
    // Check for existing projects with same repoUrl in this org
    const repoUrls = body.repos.map((r) => r.repoUrl);
    const existing = await tx.query.projects.findMany({
      where: and(
        eq(schema.projects.organizationId, orgId),
        inArray(schema.projects.repoUrl, repoUrls),
      ),
      columns: { repoUrl: true },
    });
    const existingUrls = new Set(existing.map((p) => p.repoUrl));

    const newRepos = body.repos.filter((r) => !existingUrls.has(r.repoUrl));
    if (newRepos.length === 0) {
      return { conflict: true as const };
    }

    const now = Date.now();
    const created = newRepos.map((repo) => ({
      id: crypto.randomUUID(),
      organizationId: orgId,
      name: repo.name,
      repoUrl: repo.repoUrl,
      installationId: repo.installationId,
      createdAt: now,
      updatedAt: now,
    }));

    await tx.insert(schema.projects).values(created);

    const txid = await getCurrentTxid(
      tx as unknown as { execute: (query: ReturnType<typeof sql>) => Promise<unknown> },
    );
    return { created, txid };
  });

  if ("conflict" in result) {
    return c.json({ error: "All selected repos already have projects" }, 409);
  }

  return withTxid(c.json(result.created, 201), result.txid);
});

export { projects };

import { eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { AppDb } from "../db/client";
import * as schema from "../db/schema";
import { clauseToString } from "../lib/clause-to-string";
import { electricFn } from "../lib/electric";

type Env = {
  Variables: {
    db: AppDb;
    session: {
      session: { userId: string; activeOrganizationId?: string | null };
      user: { id: string; name: string; email: string; image?: string | null };
    };
  };
};

const pullRequests = new Hono<Env>();

function getOrgId(c: { get: (key: "session") => Env["Variables"]["session"] }): string | null {
  const session = c.get("session");
  return (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;
}

pullRequests.get("/shape", async (c) => {
  const orgId = getOrgId(c);
  const db = c.get("db");

  if (!orgId) {
    return c.json({ error: "No active organization" }, 400);
  }

  const orgProjects = await db.query.projects.findMany({
    where: eq(schema.projects.organizationId, orgId),
    columns: { installationId: true },
  });
  const installationIds = [
    ...new Set(
      orgProjects
        .map((project) => project.installationId)
        .filter((installationId): installationId is number => installationId !== null),
    ),
  ];

  if (installationIds.length === 0) {
    return electricFn({
      request: c.req.raw,
      table: "pull_requests",
      where: "1 = 0",
    });
  }

  const whereClause =
    installationIds.length === 1
      ? clauseToString(eq(schema.pullRequests.installationId, installationIds[0]))
      : clauseToString(inArray(schema.pullRequests.installationId, installationIds));

  return electricFn({
    request: c.req.raw,
    table: "pull_requests",
    where: whereClause,
  });
});

export { pullRequests };

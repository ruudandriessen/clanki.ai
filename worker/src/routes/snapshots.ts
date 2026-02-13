import { and, desc, eq } from "drizzle-orm";
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

const snapshots = new Hono<Env>();

function getOrgId(c: { get: (key: "session") => Env["Variables"]["session"] }): string | null {
  const session = c.get("session");
  return (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;
}

async function ensureProjectForOrg(db: AppDb, projectId: string, orgId: string) {
  return db.query.projects.findFirst({
    where: and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, orgId)),
    columns: { id: true },
  });
}

// GET /api/projects/:projectId/snapshots — list snapshots for a project
snapshots.get("/", async (c) => {
  const db = c.get("db");
  const projectId = c.req.param("projectId")!;
  const orgId = getOrgId(c);

  if (!orgId) {
    return c.json({ error: "No active organization" }, 400);
  }

  const project = await ensureProjectForOrg(db, projectId, orgId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const rows = await db.query.snapshots.findMany({
    where: eq(schema.snapshots.projectId, projectId),
    orderBy: desc(schema.snapshots.createdAt),
  });

  return c.json(rows);
});

// GET /api/projects/:projectId/snapshots/latest — most recent snapshot
snapshots.get("/latest", async (c) => {
  const db = c.get("db");
  const projectId = c.req.param("projectId")!;
  const orgId = getOrgId(c);

  if (!orgId) {
    return c.json({ error: "No active organization" }, 400);
  }

  const project = await ensureProjectForOrg(db, projectId, orgId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const snapshot = await db.query.snapshots.findFirst({
    where: eq(schema.snapshots.projectId, projectId),
    orderBy: desc(schema.snapshots.createdAt),
  });

  if (!snapshot) {
    return c.json({ error: "No snapshots found" }, 404);
  }

  return c.json(snapshot);
});

// GET /api/projects/:projectId/snapshots/:snapshotId — single snapshot
snapshots.get("/:snapshotId", async (c) => {
  const db = c.get("db");
  const projectId = c.req.param("projectId")!;
  const snapshotId = c.req.param("snapshotId")!;
  const orgId = getOrgId(c);

  if (!orgId) {
    return c.json({ error: "No active organization" }, 400);
  }

  const project = await ensureProjectForOrg(db, projectId, orgId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const snapshot = await db.query.snapshots.findFirst({
    where: and(eq(schema.snapshots.id, snapshotId), eq(schema.snapshots.projectId, projectId)),
  });

  if (!snapshot) {
    return c.json({ error: "Snapshot not found" }, 404);
  }

  return c.json(snapshot);
});

// GET /api/projects/:projectId/snapshots/:snapshotId/graph — full graph data
snapshots.get("/:snapshotId/graph", async (c) => {
  const db = c.get("db");
  const projectId = c.req.param("projectId")!;
  const snapshotId = c.req.param("snapshotId")!;
  const orgId = getOrgId(c);

  if (!orgId) {
    return c.json({ error: "No active organization" }, 400);
  }

  const project = await ensureProjectForOrg(db, projectId, orgId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  // Fetch all graph data in parallel
  const [groups, classifications, fileEdgeRows, groupEdgeRows] = await Promise.all([
    db.query.groupDefinitions.findMany({
      where: eq(schema.groupDefinitions.projectId, projectId),
    }),
    db.query.fileClassifications.findMany({
      where: eq(schema.fileClassifications.snapshotId, snapshotId),
    }),
    db.query.fileEdges.findMany({
      where: eq(schema.fileEdges.snapshotId, snapshotId),
    }),
    db.query.groupEdges.findMany({
      where: eq(schema.groupEdges.snapshotId, snapshotId),
    }),
  ]);

  return c.json({
    groups: groups.map((g) => ({ name: g.name, description: g.description, color: g.color })),
    classifications: classifications.map((cl) => ({
      file: cl.filePath,
      group: cl.groupName,
      strategy: cl.strategy,
    })),
    fileEdges: fileEdgeRows.map((e) => ({
      from: e.fromFile,
      to: e.toFile,
      symbols: JSON.parse(e.symbols),
    })),
    groupEdges: groupEdgeRows.map((e) => ({
      from: e.fromGroup,
      to: e.toGroup,
      weight: e.weight,
      symbols: JSON.parse(e.symbols),
    })),
  });
});

export { snapshots };

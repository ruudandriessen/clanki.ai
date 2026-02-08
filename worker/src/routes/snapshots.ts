import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import * as schema from "../db/schema";
import type { DrizzleD1Database } from "drizzle-orm/d1";

type Env = {
  Variables: {
    db: DrizzleD1Database<typeof schema>;
  };
};

const snapshots = new Hono<Env>();

// GET /api/projects/:projectId/snapshots — list snapshots for a project
snapshots.get("/", async (c) => {
  const db = c.get("db");
  const projectId = c.req.param("projectId")!;

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
  const snapshotId = c.req.param("snapshotId")!;

  const snapshot = await db.query.snapshots.findFirst({
    where: eq(schema.snapshots.id, snapshotId),
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
    groups: groups.map((g) => ({ name: g.name, description: g.description })),
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

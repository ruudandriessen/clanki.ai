import { eq, and } from "drizzle-orm";
import type { Context } from "hono";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";

interface AnalysisPayload {
  repository: string;
  commitSha: string;
  fileEdges: Array<{ from: string; to: string; symbols: string[] }>;
  classifications: Array<{ file: string; group: string; strategy: string }>;
  groupEdges: Array<{ from: string; to: string; weight: number; symbols: string[] }>;
  groups: Array<{ name: string; description: string }>;
}

/**
 * Verify a GitHub token has access to the claimed repository.
 * Calls the GitHub API to confirm the token is valid and scoped to this repo.
 */
async function verifyGitHubToken(token: string, repository: string): Promise<boolean> {
  const res = await fetch(`https://api.github.com/repos/${repository}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "clanki-worker",
    },
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { full_name?: string };
  return data.full_name === repository;
}

/**
 * Insert rows in batches to stay within D1's parameter limits.
 */
async function batchInsert<T extends Record<string, unknown>>(
  db: DrizzleD1Database<typeof schema>,
  table: Parameters<typeof db.insert>[0],
  rows: T[],
  batchSize = 50,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.insert(table) as any).values(batch);
  }
}

export async function handleAnalysisResults(c: Context): Promise<Response> {
  const db = c.get("db") as DrizzleD1Database<typeof schema>;

  // Parse body
  let payload: AnalysisPayload;
  try {
    payload = await c.req.json<AnalysisPayload>();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  const { repository, commitSha } = payload;
  if (!repository || !commitSha) {
    return c.json({ error: "repository and commitSha are required" }, 400);
  }

  // Verify the GitHub token has access to the claimed repository
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token || !(await verifyGitHubToken(token, repository))) {
    return c.json({ error: "unauthorized" }, 401);
  }

  // Find the snapshot by commit SHA + repo
  const repoUrl = `https://github.com/${repository}`;
  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.repoUrl, repoUrl),
  });

  if (!project) {
    return c.json({ error: `no project found for repository ${repository}` }, 404);
  }

  const snapshot = await db.query.snapshots.findFirst({
    where: and(
      eq(schema.snapshots.projectId, project.id),
      eq(schema.snapshots.commitSha, commitSha),
    ),
  });

  if (!snapshot) {
    return c.json({ error: `no snapshot found for commit ${commitSha}` }, 404);
  }

  if (snapshot.status === "complete") {
    return c.json({ message: "snapshot already complete" }, 200);
  }

  // Insert file edges
  if (payload.fileEdges.length > 0) {
    const rows = payload.fileEdges.map((e) => ({
      id: crypto.randomUUID(),
      snapshotId: snapshot.id,
      fromFile: e.from,
      toFile: e.to,
      symbols: JSON.stringify(e.symbols),
    }));
    await batchInsert(db, schema.fileEdges, rows);
  }

  // Insert classifications
  if (payload.classifications.length > 0) {
    const rows = payload.classifications.map((c) => ({
      id: crypto.randomUUID(),
      snapshotId: snapshot.id,
      filePath: c.file,
      groupName: c.group,
      strategy: c.strategy,
    }));
    await batchInsert(db, schema.fileClassifications, rows);
  }

  // Insert group edges
  if (payload.groupEdges.length > 0) {
    const rows = payload.groupEdges.map((e) => ({
      id: crypto.randomUUID(),
      snapshotId: snapshot.id,
      fromGroup: e.from,
      toGroup: e.to,
      weight: e.weight,
      symbols: JSON.stringify(e.symbols),
    }));
    await batchInsert(db, schema.groupEdges, rows);
  }

  // Upsert group definitions
  for (const group of payload.groups) {
    const existing = await db.query.groupDefinitions.findFirst({
      where: and(
        eq(schema.groupDefinitions.projectId, project.id),
        eq(schema.groupDefinitions.name, group.name),
      ),
    });
    if (existing) {
      await db
        .update(schema.groupDefinitions)
        .set({ description: group.description })
        .where(eq(schema.groupDefinitions.id, existing.id));
    } else {
      await db.insert(schema.groupDefinitions).values({
        id: crypto.randomUUID(),
        projectId: project.id,
        name: group.name,
        description: group.description,
      });
    }
  }

  // Mark snapshot complete
  await db
    .update(schema.snapshots)
    .set({ status: "complete" })
    .where(eq(schema.snapshots.id, snapshot.id));

  return c.json({ message: "ok", snapshotId: snapshot.id }, 200);
}

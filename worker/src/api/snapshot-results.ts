import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { snapshots } from "../db/schema";

interface AnalysisPayload {
  repository: string;
  commitSha: string;
  branch?: string;
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

// D1 rejects queries with >= 100 bind parameters
const D1_MAX_BIND_PARAMS = 99;

async function batchInsert<T extends Record<string, unknown>>(
  rows: T[],
  insert: (batch: T[]) => Promise<void>,
): Promise<void> {
  if (rows.length === 0) return;
  const columnsPerRow = Object.keys(rows[0]).length;
  const batchSize = Math.max(1, Math.floor(D1_MAX_BIND_PARAMS / columnsPerRow));
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    await insert(batch);
  }
}

function uniqueSymbols(symbols: string[]): string[] {
  return [...new Set(symbols)];
}

function dedupeFileEdges(fileEdges: AnalysisPayload["fileEdges"]): AnalysisPayload["fileEdges"] {
  const byEdge = new Map<string, { from: string; to: string; symbols: Set<string> }>();
  for (const edge of fileEdges) {
    const key = `${edge.from}\u0000${edge.to}`;
    const existing = byEdge.get(key);
    if (!existing) {
      byEdge.set(key, {
        from: edge.from,
        to: edge.to,
        symbols: new Set(edge.symbols),
      });
      continue;
    }
    for (const symbol of edge.symbols) {
      existing.symbols.add(symbol);
    }
  }
  return [...byEdge.values()].map((edge) => ({
    from: edge.from,
    to: edge.to,
    symbols: [...edge.symbols],
  }));
}

function dedupeClassifications(
  classifications: AnalysisPayload["classifications"],
): AnalysisPayload["classifications"] {
  const byFile = new Map<string, AnalysisPayload["classifications"][number]>();
  for (const classification of classifications) {
    byFile.set(classification.file, classification);
  }
  return [...byFile.values()];
}

function dedupeGroupEdges(
  groupEdges: AnalysisPayload["groupEdges"],
): AnalysisPayload["groupEdges"] {
  const byEdge = new Map<
    string,
    { from: string; to: string; weight: number; symbols: Set<string> }
  >();
  for (const edge of groupEdges) {
    const key = `${edge.from}\u0000${edge.to}`;
    const existing = byEdge.get(key);
    if (!existing) {
      byEdge.set(key, {
        from: edge.from,
        to: edge.to,
        weight: edge.weight,
        symbols: new Set(edge.symbols),
      });
      continue;
    }
    existing.weight += edge.weight;
    for (const symbol of edge.symbols) {
      existing.symbols.add(symbol);
    }
  }
  return [...byEdge.values()].map((edge) => ({
    from: edge.from,
    to: edge.to,
    weight: edge.weight,
    symbols: [...edge.symbols],
  }));
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

  let snapshot = await db.query.snapshots.findFirst({
    where: and(
      eq(schema.snapshots.projectId, project.id),
      eq(schema.snapshots.commitSha, commitSha),
    ),
  });

  if (!snapshot) {
    const id = crypto.randomUUID();
    await db.insert(snapshots).values({
      id,
      projectId: project.id,
      pullRequestId: null,
      commitSha,
      branch: payload.branch ?? null,
      status: "pending",
      createdAt: Date.now(),
    });
    snapshot = await db.query.snapshots.findFirst({
      where: eq(schema.snapshots.id, id),
    });
    if (!snapshot) {
      return c.json({ error: "failed to create snapshot" }, 500);
    }
  }

  if (snapshot.status === "complete") {
    return c.json({ message: "snapshot already complete" }, 200);
  }

  const fileEdges = dedupeFileEdges(payload.fileEdges);
  const classifications = dedupeClassifications(payload.classifications);
  const groupEdges = dedupeGroupEdges(payload.groupEdges);

  // Insert file edges
  if (fileEdges.length > 0) {
    const rows = fileEdges.map((e) => ({
      id: crypto.randomUUID(),
      snapshotId: snapshot.id,
      fromFile: e.from,
      toFile: e.to,
      symbols: JSON.stringify(uniqueSymbols(e.symbols)),
    }));
    await batchInsert(rows, async (batch) => {
      await db
        .insert(schema.fileEdges)
        .values(batch)
        .onConflictDoNothing({
          target: [schema.fileEdges.snapshotId, schema.fileEdges.fromFile, schema.fileEdges.toFile],
        });
    });
  }

  // Insert classifications
  if (classifications.length > 0) {
    const rows = classifications.map((classification) => ({
      id: crypto.randomUUID(),
      snapshotId: snapshot.id,
      filePath: classification.file,
      groupName: classification.group,
      strategy: classification.strategy,
    }));
    await batchInsert(rows, async (batch) => {
      await db
        .insert(schema.fileClassifications)
        .values(batch)
        .onConflictDoNothing({
          target: [schema.fileClassifications.snapshotId, schema.fileClassifications.filePath],
        });
    });
  }

  // Insert group edges
  if (groupEdges.length > 0) {
    const rows = groupEdges.map((edge) => ({
      id: crypto.randomUUID(),
      snapshotId: snapshot.id,
      fromGroup: edge.from,
      toGroup: edge.to,
      weight: edge.weight,
      symbols: JSON.stringify(uniqueSymbols(edge.symbols)),
    }));
    await batchInsert(rows, async (batch) => {
      await db
        .insert(schema.groupEdges)
        .values(batch)
        .onConflictDoNothing({
          target: [
            schema.groupEdges.snapshotId,
            schema.groupEdges.fromGroup,
            schema.groupEdges.toGroup,
          ],
        });
    });
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

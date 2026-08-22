import { and, eq } from "drizzle-orm";
import type { AppDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";

export type ThreadMetadata = {
  branch: string | null;
  runnerSessionId: string | null;
};

function threadScope(threadId: string): string {
  return `thread:${threadId}`;
}

async function readMetadataValue(db: AppDb, threadId: string, key: string): Promise<string | null> {
  const row = await db.query.aiMetadata.findFirst({
    where: and(eq(schema.aiMetadata.scope, threadScope(threadId)), eq(schema.aiMetadata.key, key)),
  });
  if (!row) {
    return null;
  }

  const parsed = JSON.parse(row.valueJson) as unknown;
  return typeof parsed === "string" && parsed.length > 0 ? parsed : null;
}

async function writeMetadataValue(
  db: AppDb,
  threadId: string,
  key: string,
  value: string | null,
): Promise<void> {
  const scope = threadScope(threadId);
  if (value === null) {
    await db
      .delete(schema.aiMetadata)
      .where(and(eq(schema.aiMetadata.scope, scope), eq(schema.aiMetadata.key, key)));
    return;
  }

  await db
    .insert(schema.aiMetadata)
    .values({ scope, key, valueJson: JSON.stringify(value) })
    .onConflictDoUpdate({
      target: [schema.aiMetadata.scope, schema.aiMetadata.key],
      set: { valueJson: JSON.stringify(value) },
    });
}

export async function readThreadMetadata(db: AppDb, threadId: string): Promise<ThreadMetadata> {
  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, threadId),
    columns: { branch: true, runnerSessionId: true },
  });

  const [branch, runnerSessionId] = await Promise.all([
    readMetadataValue(db, threadId, "branch"),
    readMetadataValue(db, threadId, "runnerSessionId"),
  ]);

  return {
    branch: branch ?? task?.branch ?? null,
    runnerSessionId: runnerSessionId ?? task?.runnerSessionId ?? null,
  };
}

export async function writeThreadMetadata(
  db: AppDb,
  threadId: string,
  patch: Partial<ThreadMetadata>,
): Promise<void> {
  if ("branch" in patch) {
    await writeMetadataValue(db, threadId, "branch", patch.branch ?? null);
  }
  if ("runnerSessionId" in patch) {
    await writeMetadataValue(db, threadId, "runnerSessionId", patch.runnerSessionId ?? null);
  }
}

export async function loadThreadMetadataByTaskIds(
  db: AppDb,
  taskIds: string[],
): Promise<Map<string, ThreadMetadata>> {
  const metadata = new Map<string, ThreadMetadata>();
  if (taskIds.length === 0) {
    return metadata;
  }

  await Promise.all(
    taskIds.map(async (taskId) => {
      metadata.set(taskId, await readThreadMetadata(db, taskId));
    }),
  );

  return metadata;
}

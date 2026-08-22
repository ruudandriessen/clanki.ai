/// <reference types="bun-types" />
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, test } from "bun:test";
import type { StreamChunk } from "@tanstack/ai";
import { EventType } from "@tanstack/ai";
import { getMigrationsFolder } from "../db/migrations-folder";
import * as schema from "../db/schema";
import { reapStaleAiRuns } from "./reap-stale-ai-runs";
import { sqliteStream } from "./sqlite-stream-durability";

async function createTestDb() {
  const client = createClient({ url: ":memory:" });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: getMigrationsFolder() });
  await client.execute("PRAGMA foreign_keys = ON");
  return { client, db };
}

async function seedRun(db: Awaited<ReturnType<typeof createTestDb>>["db"], runId: string) {
  const now = Date.now();
  await db.insert(schema.tasks).values({
    id: "task-1",
    title: "Task",
    status: "open",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(schema.aiRuns).values({
    runId,
    threadId: "task-1",
    status: "running",
    startedAt: now,
  });
}

describe("sqliteStream", () => {
  test("persists chunks across adapter instances", async () => {
    const { client, db } = await createTestDb();
    const runId = "run-test-1";

    try {
      await seedRun(db, runId);
      const getDb = async () => db;
      const chunk: StreamChunk = {
        type: EventType.TEXT_MESSAGE_CONTENT,
        delta: "hello",
        messageId: "m1",
      };

      const producer = sqliteStream({ runId }, getDb);
      await producer.append([chunk]);
      await producer.close();

      const replayChunks: StreamChunk[] = [];
      const consumer = sqliteStream({ runId, offset: "-1" }, getDb);
      for await (const entry of consumer.read("-1")) {
        replayChunks.push(entry.chunk);
      }

      expect(replayChunks).toEqual([chunk]);
    } finally {
      client.close();
    }
  });

  test("allows stream logs before the ai_runs row exists", async () => {
    const { client, db } = await createTestDb();
    const runId = "run-without-ai-run-row";

    try {
      const getDb = async () => db;
      const producer = sqliteStream({ runId }, getDb);
      await producer.append([
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          delta: "early",
          messageId: "m1",
        },
      ]);
      await producer.close();

      const log = await db.query.aiStreamLogs.findFirst({
        where: (logs, { eq }) => eq(logs.runId, runId),
      });
      expect(log?.complete).toBe(1);
    } finally {
      client.close();
    }
  });
});

describe("reapStaleAiRuns", () => {
  test("marks orphaned running runs as interrupted", async () => {
    const { client, db } = await createTestDb();
    const runId = "run-stale-1";

    try {
      await seedRun(db, runId);
      const reaped = await reapStaleAiRuns(db);
      expect(reaped).toBe(1);

      const run = await db.query.aiRuns.findFirst({
        where: (runs, { eq }) => eq(runs.runId, runId),
      });
      expect(run?.status).toBe("interrupted");
      expect(run?.error).toBe("Run interrupted by app restart");
    } finally {
      client.close();
    }
  });
});

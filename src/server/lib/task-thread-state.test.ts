/// <reference types="bun-types" />
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, test } from "bun:test";
import { getMigrationsFolder } from "@/server/db/migrations-folder";
import * as schema from "@/server/db/schema";
import { loadTaskThreadStates } from "@/server/lib/task-thread-state";

async function createTestDb() {
  const client = createClient({ url: ":memory:" });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: getMigrationsFolder() });
  await client.execute("PRAGMA foreign_keys = ON");
  return { client, db };
}

describe("loadTaskThreadStates", () => {
  test("marks a task running when it has an active ai run", async () => {
    const { client, db } = await createTestDb();
    const now = Date.now();

    try {
      await db.insert(schema.tasks).values({
        id: "task-1",
        title: "Task",
        status: "open",
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(schema.aiRuns).values({
        runId: "run-1",
        threadId: "task-1",
        status: "running",
        startedAt: now,
      });

      const states = await loadTaskThreadStates(db, ["task-1"]);

      expect(states.get("task-1")).toEqual({ isRunning: true, chatError: null });
    } finally {
      client.close();
    }
  });

  test("uses the latest failed run error when the task is idle", async () => {
    const { client, db } = await createTestDb();
    const now = Date.now();

    try {
      await db.insert(schema.tasks).values({
        id: "task-1",
        title: "Task",
        status: "open",
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(schema.aiRuns).values([
        {
          runId: "run-old",
          threadId: "task-1",
          status: "failed",
          startedAt: now - 2_000,
          finishedAt: now - 1_000,
          error: "Old failure",
        },
        {
          runId: "run-new",
          threadId: "task-1",
          status: "completed",
          startedAt: now,
          finishedAt: now + 1_000,
        },
      ]);

      const states = await loadTaskThreadStates(db, ["task-1"]);

      expect(states.get("task-1")).toEqual({ isRunning: false, chatError: null });
    } finally {
      client.close();
    }
  });

  test("surfaces the latest failed run error", async () => {
    const { client, db } = await createTestDb();
    const now = Date.now();

    try {
      await db.insert(schema.tasks).values({
        id: "task-1",
        title: "Task",
        status: "open",
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(schema.aiRuns).values({
        runId: "run-failed",
        threadId: "task-1",
        status: "failed",
        startedAt: now,
        finishedAt: now + 500,
        error: "Model unavailable",
      });

      const states = await loadTaskThreadStates(db, ["task-1"]);

      expect(states.get("task-1")).toEqual({
        isRunning: false,
        chatError: "Model unavailable",
      });
    } finally {
      client.close();
    }
  });
});

/// <reference types="bun-types" />
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, test } from "bun:test";
import { getMigrationsFolder } from "@/server/db/migrations-folder";
import * as schema from "@/server/db/schema";
import { loadTaskThreadSnapshots, resolveTaskExecutionState } from "@/server/lib/task-thread-state";

async function createTestDb() {
  const client = createClient({ url: ":memory:" });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: getMigrationsFolder() });
  await client.execute("PRAGMA foreign_keys = ON");
  return { client, db };
}

describe("resolveTaskExecutionState", () => {
  test("prefers running over stored workspace and chat errors", () => {
    expect(
      resolveTaskExecutionState({
        workspaceError: "Workspace failed",
        thread: { hasActiveRun: true, latestChatError: "Model unavailable" },
      }),
    ).toEqual({ kind: "running" });
  });

  test("surfaces workspace errors before chat errors when idle", () => {
    expect(
      resolveTaskExecutionState({
        workspaceError: "Workspace failed",
        thread: { hasActiveRun: false, latestChatError: "Model unavailable" },
      }),
    ).toEqual({ kind: "blocked", message: "Workspace failed" });
  });

  test("returns idle when there is no active run or error", () => {
    expect(
      resolveTaskExecutionState({
        workspaceError: null,
        thread: { hasActiveRun: false, latestChatError: null },
      }),
    ).toEqual({ kind: "idle" });
  });
});

describe("loadTaskThreadSnapshots", () => {
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

      const snapshots = await loadTaskThreadSnapshots(db, ["task-1"]);

      expect(snapshots.get("task-1")).toEqual({
        hasActiveRun: true,
        latestChatError: null,
      });
    } finally {
      client.close();
    }
  });

  test("ignores older failed runs when a newer run completed", async () => {
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

      const snapshots = await loadTaskThreadSnapshots(db, ["task-1"]);

      expect(snapshots.get("task-1")).toEqual({
        hasActiveRun: false,
        latestChatError: null,
      });
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

      const snapshots = await loadTaskThreadSnapshots(db, ["task-1"]);

      expect(snapshots.get("task-1")).toEqual({
        hasActiveRun: false,
        latestChatError: "Model unavailable",
      });
    } finally {
      client.close();
    }
  });
});

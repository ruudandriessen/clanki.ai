/// <reference types="bun-types" />
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, test } from "bun:test";
import { getMigrationsFolder } from "../db/migrations-folder";
import * as schema from "../db/schema";
import { readThreadMetadata, writeThreadMetadata } from "./thread-metadata";

async function createTestDb() {
  const client = createClient({ url: ":memory:" });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: getMigrationsFolder() });
  await client.execute("PRAGMA foreign_keys = ON");
  return { client, db };
}

describe("thread metadata", () => {
  test("writes branch, runner session, and workspace errors to ai_metadata", async () => {
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

      await writeThreadMetadata(db, "task-1", {
        branch: "feature/chat",
        runnerSessionId: "session-123",
        workspaceError: "Workspace failed",
      });

      const metadata = await readThreadMetadata(db, "task-1");
      expect(metadata).toEqual({
        branch: "feature/chat",
        runnerSessionId: "session-123",
        workspaceError: "Workspace failed",
      });
    } finally {
      client.close();
    }
  });

  test("returns nulls when metadata is absent", async () => {
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

      const metadata = await readThreadMetadata(db, "task-1");
      expect(metadata).toEqual({
        branch: null,
        runnerSessionId: null,
        workspaceError: null,
      });
    } finally {
      client.close();
    }
  });
});

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
  test("writes branch and runner session to ai_metadata", async () => {
    const { client, db } = await createTestDb();
    const now = Date.now();

    try {
      await db.insert(schema.tasks).values({
        id: "task-1",
        title: "Task",
        status: "open",
        branch: "legacy-branch",
        runnerSessionId: "legacy-session",
        createdAt: now,
        updatedAt: now,
      });

      await writeThreadMetadata(db, "task-1", {
        branch: "feature/chat",
        runnerSessionId: "session-123",
      });

      const metadata = await readThreadMetadata(db, "task-1");
      expect(metadata).toEqual({
        branch: "feature/chat",
        runnerSessionId: "session-123",
      });
    } finally {
      client.close();
    }
  });

  test("falls back to legacy task columns when metadata is absent", async () => {
    const { client, db } = await createTestDb();
    const now = Date.now();

    try {
      await db.insert(schema.tasks).values({
        id: "task-1",
        title: "Task",
        status: "open",
        branch: "legacy-branch",
        runnerSessionId: "legacy-session",
        createdAt: now,
        updatedAt: now,
      });

      const metadata = await readThreadMetadata(db, "task-1");
      expect(metadata).toEqual({
        branch: "legacy-branch",
        runnerSessionId: "legacy-session",
      });
    } finally {
      client.close();
    }
  });
});

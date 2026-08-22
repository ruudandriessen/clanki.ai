/// <reference types="bun-types" />
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, test } from "bun:test";
import type { ModelMessage } from "@tanstack/ai";
import { getMigrationsFolder } from "@/server/db/migrations-folder";
import * as schema from "@/server/db/schema";
import { createTaskChatPersistence } from "@/server/lib/ai-persistence";

async function createTestDb() {
  const client = createClient({ url: ":memory:" });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: getMigrationsFolder() });
  await client.execute("PRAGMA foreign_keys = ON");
  return { client, db };
}

describe("taskChatPersistence", () => {
  test("round-trips chat messages by thread id", async () => {
    const { client, db } = await createTestDb();
    const persistence = createTaskChatPersistence(async () => db);

    try {
      const threadId = "task-123";
      const now = Date.now();
      await db.insert(schema.tasks).values({
        id: threadId,
        title: "Test task",
        status: "open",
        createdAt: now,
        updatedAt: now,
      });

      const messages: ModelMessage[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
      ];

      await persistence.stores.messages!.saveThread(threadId, messages);
      const loaded = await persistence.stores.messages!.loadThread(threadId);

      expect(loaded).toEqual(messages);
    } finally {
      client.close();
    }
  });
});

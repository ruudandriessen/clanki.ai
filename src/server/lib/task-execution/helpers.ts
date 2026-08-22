import type { AppDb } from "../../db/client";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { writeThreadMetadata } from "@/server/lib/thread-metadata";

export async function syncTaskAfterChat(args: {
  db: AppDb;
  taskId: string;
  runnerSessionId?: string;
  branch?: string;
}): Promise<void> {
  await args.db
    .update(schema.tasks)
    .set({ updatedAt: Date.now() })
    .where(eq(schema.tasks.id, args.taskId));

  await writeThreadMetadata(args.db, args.taskId, {
    ...(args.runnerSessionId ? { runnerSessionId: args.runnerSessionId } : {}),
    ...(args.branch ? { branch: args.branch } : {}),
  });
}

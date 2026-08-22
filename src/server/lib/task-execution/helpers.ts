import type { AppDb } from "../../db/client";
import * as schema from "../../db/schema";
import { eq } from "drizzle-orm";

export async function syncTaskAfterChat(args: {
  db: AppDb;
  taskId: string;
  runnerSessionId?: string;
  branch?: string;
}): Promise<void> {
  await args.db
    .update(schema.tasks)
    .set({
      updatedAt: Date.now(),
      ...(args.runnerSessionId ? { runnerSessionId: args.runnerSessionId } : {}),
      ...(args.branch ? { branch: args.branch } : {}),
    })
    .where(eq(schema.tasks.id, args.taskId));
}

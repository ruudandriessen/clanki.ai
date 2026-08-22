import type { AppDb } from "../../db/client";
import * as schema from "../../db/schema";
import { eq } from "drizzle-orm";

export async function completeTask(args: {
  db: AppDb;
  taskId: string;
  runnerSessionId?: string;
  branch?: string;
}): Promise<void> {
  await args.db
    .update(schema.tasks)
    .set({
      status: "open",
      error: null,
      updatedAt: Date.now(),
      ...(args.runnerSessionId ? { runnerSessionId: args.runnerSessionId } : {}),
      ...(args.branch ? { branch: args.branch } : {}),
    })
    .where(eq(schema.tasks.id, args.taskId));
}

export async function markTaskFailed(args: {
  db: AppDb;
  taskId: string;
  message: string;
}): Promise<void> {
  await args.db
    .update(schema.tasks)
    .set({ status: "open", error: args.message, updatedAt: Date.now() })
    .where(eq(schema.tasks.id, args.taskId));
}

export async function markTaskRunning(args: { db: AppDb; taskId: string }): Promise<void> {
  await args.db
    .update(schema.tasks)
    .set({ status: "running", error: null, updatedAt: Date.now() })
    .where(eq(schema.tasks.id, args.taskId));
}

import { desc, eq } from "drizzle-orm";
import type { AppDb } from "../../db/client";
import * as schema from "../../db/schema";

export async function markTaskRunning(args: {
  db: AppDb;
  taskId: string;
  sandboxId: string;
}): Promise<void> {
  await args.db
    .update(schema.tasks)
    .set({ sandboxId: args.sandboxId, status: "running", previewUrl: null, updatedAt: Date.now() })
    .where(eq(schema.tasks.id, args.taskId));
}

export async function setTaskPreviewUrl(args: {
  db: AppDb;
  taskId: string;
  previewUrl: string;
}): Promise<void> {
  await args.db
    .update(schema.tasks)
    .set({ previewUrl: args.previewUrl, updatedAt: Date.now() })
    .where(eq(schema.tasks.id, args.taskId));
}

export async function completeTask(args: { db: AppDb; taskId: string }): Promise<void> {
  await args.db
    .update(schema.tasks)
    .set({ status: "open", error: null, updatedAt: Date.now() })
    .where(eq(schema.tasks.id, args.taskId));
}

export async function markTaskFailed(args: {
  db: AppDb;
  taskId: string;
  message: string;
}): Promise<void> {
  try {
    await args.db
      .update(schema.tasks)
      .set({ status: "open", error: args.message, updatedAt: Date.now() })
      .where(eq(schema.tasks.id, args.taskId));
  } catch {}
}

export async function insertAssistantTaskMessage(args: {
  db: AppDb;
  organizationId: string;
  taskId: string;
  content: string;
}): Promise<string> {
  const { db, organizationId, taskId, content } = args;

  const taskMessageId = crypto.randomUUID();
  const createdAt = await getNextTaskMessageTimestamp(db, taskId);

  await db.insert(schema.taskMessages).values({
    id: taskMessageId,
    organizationId,
    taskId,
    role: "assistant",
    content,
    createdAt,
  });

  return taskMessageId;
}

async function getNextTaskMessageTimestamp(db: AppDb, taskId: string): Promise<number> {
  const now = Date.now();
  const latest = await db.query.taskMessages.findFirst({
    where: eq(schema.taskMessages.taskId, taskId),
    columns: { createdAt: true },
    orderBy: desc(schema.taskMessages.createdAt),
  });

  if (!latest?.createdAt) {
    return now;
  }

  return latest.createdAt >= now ? latest.createdAt + 1 : now;
}

export function truncateCommandOutput(value: string, maxLength = 2000): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n...truncated...`;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unknown task execution failure";
}

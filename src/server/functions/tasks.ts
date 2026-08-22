import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { withTransaction } from "@/server/db/transaction";
import { toTask } from "@/server/lib/to-task";
import { dbMiddleware } from "../middleware";
import { badRequest, notFound, parseOptionalId, parseOptionalTimestamp } from "./common";

async function getTaskRow(db: AppDb, taskId: string) {
  return db.query.tasks.findFirst({
    where: eq(schema.tasks.id, taskId),
  });
}

export const listTasks = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .handler(async ({ context }) => {
    const rows = await context.db.query.tasks.findMany({
      orderBy: (tasks, { desc: orderDesc }) => [orderDesc(tasks.updatedAt)],
    });
    return rows.map(toTask);
  });

export const createTask = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .inputValidator(
    z.object({
      id: z.string().optional(),
      title: z.string(),
      projectId: z.string(),
      runnerSessionId: z.string().optional(),
      runnerType: z.string().optional(),
      status: z.string().optional(),
      workspacePath: z.string().optional(),
      createdAt: z.number().optional(),
      updatedAt: z.number().optional(),
    }),
  )
  .handler(async ({ data: input, context }) => {
    if (input.title.trim().length === 0) {
      badRequest("title is required");
    }

    const project = await context.db.query.projects.findFirst({
      where: eq(schema.projects.id, input.projectId),
      columns: { id: true },
    });

    if (!project) {
      notFound("Project not found");
    }

    const now = Date.now();
    const createdAt = parseOptionalTimestamp(input.createdAt) ?? now;
    const updatedAt = parseOptionalTimestamp(input.updatedAt) ?? createdAt;
    const status =
      typeof input.status === "string" && input.status.trim().length > 0
        ? input.status.trim()
        : "open";
    const task = {
      id: parseOptionalId(input.id) ?? crypto.randomUUID(),
      projectId: input.projectId,
      title: input.title.trim(),
      status,
      runnerSessionId: parseOptionalId(input.runnerSessionId) ?? null,
      runnerType:
        typeof input.runnerType === "string" && input.runnerType.trim().length > 0
          ? input.runnerType.trim()
          : null,
      workspacePath:
        typeof input.workspacePath === "string" && input.workspacePath.trim().length > 0
          ? input.workspacePath.trim()
          : null,
      createdAt,
      updatedAt,
    };

    await context.db.insert(schema.tasks).values(task);
    return toTask({ ...task, branch: null, error: null });
  });

export const updateTask = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .inputValidator(
    z.object({
      taskId: z.string(),
      title: z.string().optional(),
      runnerSessionId: z.string().nullable().optional(),
      runnerType: z.string().nullable().optional(),
      workspacePath: z.string().nullable().optional(),
      error: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data: input, context }) => {
    const existing = await getTaskRow(context.db, input.taskId);
    if (!existing) {
      notFound("Task not found");
    }

    const { taskId: _, ...fields } = input;
    const updates = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined),
    ) as Partial<typeof schema.tasks.$inferInsert>;

    if (Object.keys(updates).length === 0) {
      badRequest("No task fields to update");
    }

    const updated = await withTransaction(context.db, async (tx) => {
      const updatedAt = Date.now();
      await tx
        .update(schema.tasks)
        .set({ ...updates, updatedAt })
        .where(eq(schema.tasks.id, input.taskId));

      return tx.query.tasks.findFirst({
        where: eq(schema.tasks.id, input.taskId),
      });
    });

    if (!updated) {
      notFound("Task not found");
    }

    return toTask(updated);
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .inputValidator(z.object({ taskId: z.string() }))
  .handler(async ({ data: input, context }) => {
    const existing = await getTaskRow(context.db, input.taskId);
    if (!existing) {
      notFound("Task not found");
    }

    await withTransaction(context.db, async (tx) => {
      const threadId = input.taskId;
      await tx.delete(schema.aiInterrupts).where(eq(schema.aiInterrupts.threadId, threadId));
      await tx.delete(schema.aiRuns).where(eq(schema.aiRuns.threadId, threadId));
      await tx.delete(schema.aiMessages).where(eq(schema.aiMessages.threadId, threadId));
      await tx.delete(schema.tasks).where(eq(schema.tasks.id, input.taskId));
    });
    return { ok: true };
  });

import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { withTransaction } from "@/server/db/transaction";
import { createStream } from "@/server/lib/durable-streams";
import { authMiddleware } from "../middleware";
import { badRequest, getOrgId, notFound, parseOptionalId, parseOptionalTimestamp } from "./common";

type TaskForOrg = { id: string; title: string; projectId: string | null };

async function getTaskForOrg(
  db: AppDb,
  taskId: string,
  orgId: string,
): Promise<TaskForOrg | undefined> {
  return db.query.tasks.findFirst({
    where: and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, orgId)),
    columns: { id: true, title: true, projectId: true },
  });
}

async function getLatestTaskMessageTimestamp(db: AppDb, taskId: string): Promise<number | null> {
  const latest = await db.query.taskMessages.findFirst({
    where: eq(schema.taskMessages.taskId, taskId),
    columns: { createdAt: true },
    orderBy: desc(schema.taskMessages.createdAt),
  });

  return latest?.createdAt ?? null;
}

export const createTask = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      id: z.string().optional(),
      title: z.string(),
      projectId: z.string(),
      status: z.string().optional(),
      createdAt: z.number().optional(),
      updatedAt: z.number().optional(),
    }),
  )
  .handler(async ({ data: input, context }) => {
    const db = context.db;
    const orgId = getOrgId(context);

    if (!orgId) {
      badRequest("No active organization");
    }

    if (input.title.trim().length === 0) {
      badRequest("title is required");
    }

    const project = await db.query.projects.findFirst({
      where: and(
        eq(schema.projects.id, input.projectId),
        eq(schema.projects.organizationId, orgId),
      ),
      columns: { id: true },
    });

    if (!project) {
      notFound("Project not found");
    }

    const result = await withTransaction(db, async (tx, txid) => {
      const now = Date.now();
      const createdAt = parseOptionalTimestamp(input.createdAt) ?? now;
      const updatedAt = parseOptionalTimestamp(input.updatedAt) ?? createdAt;
      const status =
        typeof input.status === "string" && input.status.trim().length > 0
          ? input.status.trim()
          : "open";
      const taskId = parseOptionalId(input.id) ?? crypto.randomUUID();

      const streamId = await createStream({
        env: context.env,
        organizationId: orgId,
        taskId: taskId,
      });

      const task = {
        id: taskId,
        organizationId: orgId,
        projectId: input.projectId,
        title: input.title.trim(),
        status,
        streamId,
        createdAt,
        updatedAt,
      };

      await tx.insert(schema.tasks).values(task);
      return { data: task, txid };
    });

    return result;
  });

export const updateTask = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      taskId: z.string(),
      title: z.string(),
    }),
  )
  .handler(async ({ data: input, context }) => {
    const db = context.db;
    const orgId = getOrgId(context);

    if (!orgId) {
      badRequest("No active organization");
    }

    const task = await getTaskForOrg(db, input.taskId, orgId);
    if (!task) {
      notFound("Task not found");
    }

    const title = input.title.trim();
    if (title.length === 0) {
      badRequest("title is required");
    }

    const result = await withTransaction(db, async (tx, txid) => {
      const updatedAt = Date.now();
      await tx
        .update(schema.tasks)
        .set({ title, updatedAt })
        .where(and(eq(schema.tasks.id, input.taskId), eq(schema.tasks.organizationId, orgId)));

      const updatedTask = await tx.query.tasks.findFirst({
        where: and(eq(schema.tasks.id, input.taskId), eq(schema.tasks.organizationId, orgId)),
      });

      if (!updatedTask) {
        return { notFound: true as const };
      }

      return { data: updatedTask, txid };
    });

    if ("notFound" in result) {
      notFound("Task not found");
    }

    return result;
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ taskId: z.string() }))
  .handler(async ({ data: input, context }) => {
    const db = context.db;
    const orgId = getOrgId(context);

    if (!orgId) {
      badRequest("No active organization");
    }

    const task = await getTaskForOrg(db, input.taskId, orgId);
    if (!task) {
      notFound("Task not found");
    }

    const txid = await withTransaction(db, async (tx, currentTxid) => {
      await tx
        .delete(schema.tasks)
        .where(and(eq(schema.tasks.id, input.taskId), eq(schema.tasks.organizationId, orgId)));
      return currentTxid;
    });

    return { txid };
  });

export const createTaskMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      taskId: z.string(),
      message: z.object({
        id: z.string().optional(),
        role: z.string(),
        content: z.string(),
        createdAt: z.number().optional(),
      }),
    }),
  )
  .handler(async ({ data: input, context }) => {
    const db = context.db;
    const orgId = getOrgId(context);

    if (!orgId) {
      badRequest("No active organization");
    }

    const task = await getTaskForOrg(db, input.taskId, orgId);
    if (!task) {
      notFound("Task not found");
    }

    const content = input.message.content.trim();
    if (content.length === 0) {
      badRequest("content is required");
    }

    if (!["user", "assistant"].includes(input.message.role)) {
      badRequest("role must be 'user' or 'assistant'");
    }

    const result = await withTransaction(db, async (tx, txid) => {
      const requestedCreatedAt = parseOptionalTimestamp(input.message.createdAt) ?? Date.now();
      const latestCreatedAt = await getLatestTaskMessageTimestamp(
        tx as unknown as AppDb,
        input.taskId,
      );
      const createdAt =
        latestCreatedAt !== null && latestCreatedAt >= requestedCreatedAt
          ? latestCreatedAt + 1
          : requestedCreatedAt;

      const message = {
        id: parseOptionalId(input.message.id) ?? crypto.randomUUID(),
        organizationId: orgId,
        taskId: input.taskId,
        role: input.message.role,
        content,
        createdAt,
      };

      await tx.insert(schema.taskMessages).values(message);
      await tx
        .update(schema.tasks)
        .set(
          input.message.role === "user"
            ? { status: "open", error: null, updatedAt: createdAt }
            : { updatedAt: createdAt },
        )
        .where(eq(schema.tasks.id, input.taskId));

      return { data: message, txid };
    });

    return result;
  });

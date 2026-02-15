import { and, desc, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { AppDb } from "../../db/client";
import { getDb } from "../../db/client";
import * as schema from "../../db/schema";
import { withTransaction } from "../../db/transaction";
import {
  DEFAULT_OPENCODE_MODEL,
  DEFAULT_OPENCODE_PROVIDER,
  isSupportedOpencodeProvider,
} from "../../lib/opencode";
import { executeTaskRun } from "../../lib/task-runs";
import { getErrorMessage, getOrgId, parseOptionalId, parseOptionalTimestamp } from "./common";
import { badRequest, internalError, notFound } from "./errors";
import { os } from "./context";

async function getTaskForOrg(
  db: AppDb,
  taskId: string,
  orgId: string,
): Promise<{ id: string; title: string; projectId: string | null } | undefined> {
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

export const tasksRouter = {
  create: os.tasks.create.handler(async ({ input, context }) => {
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

      const task = {
        id: parseOptionalId(input.id) ?? crypto.randomUUID(),
        organizationId: orgId,
        projectId: input.projectId,
        title: input.title.trim(),
        status,
        createdAt,
        updatedAt,
      };

      await tx.insert(schema.tasks).values(task);
      return { data: task, txid };
    });

    return result;
  }),
  update: os.tasks.update.handler(async ({ input, context }) => {
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
  }),
  delete: os.tasks.delete.handler(async ({ input, context }) => {
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
  }),
  createMessage: os.tasks.createMessage.handler(async ({ input, context }) => {
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
        .set({ updatedAt: createdAt })
        .where(eq(schema.tasks.id, input.taskId));

      return { data: message, txid };
    });

    return result;
  }),
  createRun: os.tasks.createRun.handler(async ({ input, context }) => {
    const db = context.db;
    const orgId = getOrgId(context);
    const userId = context.session.user.id;
    const taskId = input.taskId;

    try {
      if (!orgId) {
        badRequest("No active organization");
      }

      const task = await getTaskForOrg(db, taskId, orgId);
      if (!task) {
        notFound("Task not found");
      }

      const requestedProvider = input.provider?.trim().toLowerCase() ?? "";
      const providerInput =
        requestedProvider.length > 0 ? requestedProvider : DEFAULT_OPENCODE_PROVIDER;
      if (!isSupportedOpencodeProvider(providerInput)) {
        badRequest(`Unsupported provider: ${providerInput}`);
      }

      const model = input.model?.trim() ?? DEFAULT_OPENCODE_MODEL;
      if (model.length === 0) {
        badRequest("model is required");
      }

      const hasCredential = await db.query.userProviderCredentials.findFirst({
        where: and(
          eq(schema.userProviderCredentials.userId, userId),
          eq(schema.userProviderCredentials.provider, providerInput),
        ),
        columns: { id: true },
      });
      if (!hasCredential) {
        badRequest(`No ${providerInput} credentials configured in Settings`);
      }

      const inputMessage = input.messageId
        ? await db.query.taskMessages.findFirst({
            where: and(
              eq(schema.taskMessages.id, input.messageId),
              eq(schema.taskMessages.taskId, taskId),
              eq(schema.taskMessages.role, "user"),
            ),
          })
        : await db.query.taskMessages.findFirst({
            where: and(
              eq(schema.taskMessages.taskId, taskId),
              eq(schema.taskMessages.role, "user"),
            ),
            orderBy: desc(schema.taskMessages.createdAt),
          });

      if (!inputMessage) {
        badRequest("No user message found for this task");
      }

      const now = Date.now();
      const run = {
        id: crypto.randomUUID(),
        taskId,
        tool: "opencode",
        status: "queued",
        inputMessageId: inputMessage.id,
        outputMessageId: null,
        sandboxId: null,
        sessionId: null,
        initiatedByUserId: userId,
        provider: providerInput,
        model,
        error: null,
        startedAt: null,
        finishedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(schema.taskRuns).values(run);
      await db
        .update(schema.tasks)
        .set({ status: "running", updatedAt: now })
        .where(eq(schema.tasks.id, taskId));

      const project = task.projectId
        ? await db.query.projects.findFirst({
            where: and(
              eq(schema.projects.id, task.projectId),
              eq(schema.projects.organizationId, orgId),
            ),
            columns: { repoUrl: true, installationId: true, setupCommand: true },
          })
        : null;

      if (!project?.repoUrl) {
        badRequest("Task's project has no repository URL configured");
      }

      context.executionCtx.waitUntil(
        executeTaskRun({
          db: getDb(context.env),
          env: context.env,
          runId: run.id,
          taskId,
          taskTitle: task.title,
          prompt: inputMessage.content,
          repoUrl: project.repoUrl,
          installationId: project.installationId ?? null,
          setupCommand: project.setupCommand ?? null,
          initiatedByUserId: userId,
          organizationId: orgId,
          provider: providerInput,
          model,
        }),
      );

      return run;
    } catch (error) {
      if (error instanceof ORPCError) {
        throw error;
      }

      const message = getErrorMessage(error, "Failed to create task run");
      console.error("Failed to create task run", { taskId, userId, message });
      internalError(message);
    }
  }),
};

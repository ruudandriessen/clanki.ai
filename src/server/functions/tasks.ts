import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { withTransaction } from "@/server/db/transaction";
import {
  DEFAULT_OPENCODE_MODEL,
  DEFAULT_OPENCODE_PROVIDER,
  isSupportedOpencodeProvider,
} from "@/server/lib/opencode";
import { createStream } from "@/server/lib/durable-streams";
import { env } from "cloudflare:workers";
import { authMiddleware } from "../middleware";
import {
  badRequest,
  getErrorMessage,
  getOrgId,
  notFound,
  parseOptionalId,
  parseOptionalTimestamp,
} from "./common";

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

async function setTaskRunError(
  db: AppDb,
  args: { taskId: string; orgId: string; message: string },
) {
  const { taskId, orgId, message } = args;

  try {
    await db
      .update(schema.tasks)
      .set({ status: "open", error: message, updatedAt: Date.now() })
      .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, orgId)));
  } catch {}
}

function normalizeOrigin(value: string, fieldName: string): string {
  try {
    return new URL(value).origin;
  } catch {
    throw new Error(`${fieldName} must be an absolute URL`);
  }
}

async function queueTaskRun(args: {
  db: AppDb;
  env: typeof env;
  requestOrigin: string;
  orgId: string;
  task: TaskForOrg;
  userId: string;
  userName: string;
  userEmail: string;
  inputMessage: { id: string; content: string };
  provider?: string;
  model?: string;
}) {
  const {
    db,
    env: ctxEnv,
    requestOrigin,
    orgId,
    task,
    userId,
    userName,
    userEmail,
    inputMessage,
    provider,
    model: requestedModel,
  } = args;

  const requestedProvider = provider?.trim().toLowerCase() ?? "";
  const providerInput =
    requestedProvider.length > 0 ? requestedProvider : DEFAULT_OPENCODE_PROVIDER;
  if (!isSupportedOpencodeProvider(providerInput)) {
    badRequest(`Unsupported provider: ${providerInput}`);
  }

  const model = requestedModel?.trim() ?? DEFAULT_OPENCODE_MODEL;
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

  const configuredWorkerOrigin = ctxEnv.WORKER_CALLBACK_ORIGIN;
  const workerOrigin =
    configuredWorkerOrigin != null
      ? normalizeOrigin(configuredWorkerOrigin, "WORKER_CALLBACK_ORIGIN")
      : requestOrigin;

  const now = Date.now();
  const run = {
    id: crypto.randomUUID(),
    taskId: task.id,
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

  const runnerId = ctxEnv.TaskRunner.idFromName(run.id);
  const runner = ctxEnv.TaskRunner.get(runnerId);
  await runner.schedule({
    workerOrigin,
    executionId: run.id,
    taskId: task.id,
    taskTitle: task.title,
    prompt: inputMessage.content,
    repoUrl: project.repoUrl,
    installationId: project.installationId ?? null,
    setupCommand: project.setupCommand ?? null,
    initiatedByUserId: userId,
    initiatedByUserName: userName,
    initiatedByUserEmail: userEmail,
    organizationId: orgId,
    provider: providerInput,
    model,
  });

  return run;
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
        env,
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
            ? { status: "running", error: null, updatedAt: createdAt }
            : { updatedAt: createdAt },
        )
        .where(eq(schema.tasks.id, input.taskId));

      return { data: message, txid };
    });

    if (result.data.role === "user") {
      try {
        await queueTaskRun({
          db,
          env: context.env,
          requestOrigin: context.requestOrigin,
          orgId,
          task,
          userId: context.session.user.id,
          userName: context.session.user.name,
          userEmail: context.session.user.email,
          inputMessage: { id: result.data.id, content: result.data.content },
        });
      } catch (error) {
        const message = getErrorMessage(error, "Failed to auto-start task run");
        console.error("Failed to auto-start task run", {
          taskId: input.taskId,
          userId: context.session.user.id,
          message,
        });
        await setTaskRunError(db, { taskId: input.taskId, orgId, message });
        throw error;
      }
    }

    return result;
  });

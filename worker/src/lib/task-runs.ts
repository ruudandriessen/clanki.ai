import { and, desc, eq, isNull, not } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { createOpenCodeSession, sendOpenCodeMessage, type OpenCodeEnv } from "./opencode";

type TaskRunEnv = OpenCodeEnv;

export async function executeTaskRun(args: {
  db: DrizzleD1Database<typeof schema>;
  env: TaskRunEnv;
  runId: string;
  taskId: string;
  taskTitle: string;
  prompt: string;
}): Promise<void> {
  const { db, env, runId, taskId, taskTitle, prompt } = args;

  const startedAt = Date.now();
  await db
    .update(schema.taskRuns)
    .set({
      status: "running",
      startedAt,
      updatedAt: startedAt,
      error: null,
    })
    .where(eq(schema.taskRuns.id, runId));

  await appendRunEvent(db, runId, "status", "running", startedAt);

  try {
    const previousRun = await db.query.taskRuns.findFirst({
      where: and(
        eq(schema.taskRuns.taskId, taskId),
        eq(schema.taskRuns.tool, "opencode"),
        not(isNull(schema.taskRuns.sessionId)),
      ),
      columns: { sessionId: true },
      orderBy: desc(schema.taskRuns.createdAt),
    });

    const sessionId = previousRun?.sessionId ?? (await createOpenCodeSession(env, taskTitle));
    const result = await sendOpenCodeMessage(env, sessionId, prompt);

    const assistantMessageId = crypto.randomUUID();
    const assistantCreatedAt = Date.now();

    await db.insert(schema.taskMessages).values({
      id: assistantMessageId,
      taskId,
      role: "assistant",
      content: result.output,
      createdAt: assistantCreatedAt,
    });

    const finishedAt = Date.now();
    await db
      .update(schema.taskRuns)
      .set({
        status: "succeeded",
        sessionId,
        outputMessageId: assistantMessageId,
        finishedAt,
        updatedAt: finishedAt,
        error: null,
      })
      .where(eq(schema.taskRuns.id, runId));

    await db.update(schema.tasks).set({ updatedAt: finishedAt }).where(eq(schema.tasks.id, taskId));

    await appendRunEvent(db, runId, "assistant", result.output);
    await appendRunEvent(db, runId, "status", "succeeded");
  } catch (error) {
    const finishedAt = Date.now();
    const errorMessage = getErrorMessage(error);

    await db
      .update(schema.taskRuns)
      .set({
        status: "failed",
        finishedAt,
        updatedAt: finishedAt,
        error: errorMessage,
      })
      .where(eq(schema.taskRuns.id, runId));

    await db.update(schema.tasks).set({ updatedAt: finishedAt }).where(eq(schema.tasks.id, taskId));

    await appendRunEvent(db, runId, "error", errorMessage);
    await appendRunEvent(db, runId, "status", "failed");
  }
}

async function appendRunEvent(
  db: DrizzleD1Database<typeof schema>,
  runId: string,
  kind: string,
  payload: string,
  createdAt = Date.now(),
): Promise<void> {
  await db.insert(schema.taskRunEvents).values({
    id: crypto.randomUUID(),
    runId,
    kind,
    payload,
    createdAt,
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unknown task run failure";
}

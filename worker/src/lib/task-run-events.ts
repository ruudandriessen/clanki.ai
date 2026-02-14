import type { AppDb } from "../db/client";
import * as schema from "../db/schema";
import {
  appendTaskEventToDurableStream,
  type DurableStreamsEnv,
  type TaskEventStreamMessage,
} from "./durable-streams";

export async function appendTaskRunEvent(args: {
  db: AppDb;
  env: DurableStreamsEnv;
  organizationId: string;
  taskId: string;
  runId: string;
  kind: string;
  payload: string;
  createdAt?: number;
}): Promise<string> {
  const { db, env, organizationId, taskId, runId, kind, payload } = args;
  const createdAt = args.createdAt ?? Date.now();

  const id = crypto.randomUUID();
  await db.insert(schema.taskRunEvents).values({
    id,
    runId,
    kind,
    payload,
    createdAt,
  });

  const streamEvent: TaskEventStreamMessage = {
    id,
    taskId,
    runId,
    kind,
    payload,
    createdAt,
  };

  try {
    await appendTaskEventToDurableStream({
      env,
      organizationId,
      taskId,
      event: streamEvent,
    });
  } catch (error) {
    console.warn("Failed to mirror run event into durable stream", {
      runId,
      taskId,
      kind,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return id;
}

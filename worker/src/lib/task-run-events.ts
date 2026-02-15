import type { TaskStreamEventKind } from "../../../shared/task-stream-events";
import { appendTaskEventToDurableStream, type DurableStreamsEnv } from "./durable-streams";

export async function appendTaskEvent(args: {
  env: DurableStreamsEnv;
  organizationId: string;
  taskId: string;
  executionId: string;
  kind: TaskStreamEventKind;
  payload: string;
  createdAt?: number;
}): Promise<string> {
  const { env, organizationId, taskId, executionId, kind, payload } = args;
  const createdAt = args.createdAt ?? Date.now();

  const id = crypto.randomUUID();

  const streamEvent = {
    id,
    taskId,
    runId: executionId,
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
    console.warn("Failed to append task event to durable stream", {
      executionId,
      taskId,
      kind,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return id;
}

import {
  appendTaskEventToDurableStream,
  type DurableStreamsEnv,
  type TaskEventStreamMessage,
} from "./durable-streams";

export async function appendTaskEvent(args: {
  env: DurableStreamsEnv;
  organizationId: string;
  taskId: string;
  executionId: string;
  kind: string;
  payload: string;
  createdAt?: number;
}): Promise<string> {
  const { env, organizationId, taskId, executionId, kind, payload } = args;
  const createdAt = args.createdAt ?? Date.now();

  const id = crypto.randomUUID();

  const streamEvent: TaskEventStreamMessage = {
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

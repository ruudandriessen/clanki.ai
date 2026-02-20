import { DurableStream, DurableStreamError } from "@durable-streams/client";
import type { TaskStreamEventBase, TaskStreamEventKind } from "../../../shared/task-stream-events";

export type DurableStreamsEnv = {
  DURABLE_STREAMS_SERVICE_ID?: string;
  DURABLE_STREAMS_SECRET?: string;
};

const DURABLE_STREAMS_BASE_URL = "https://api.electric-sql.cloud";

function isDurableStreamsConfigured(env: DurableStreamsEnv): boolean {
  return (
    typeof env.DURABLE_STREAMS_SERVICE_ID === "string" &&
    env.DURABLE_STREAMS_SERVICE_ID.trim().length > 0 &&
    typeof env.DURABLE_STREAMS_SECRET === "string" &&
    env.DURABLE_STREAMS_SECRET.trim().length > 0
  );
}

function buildStreamUrl(env: DurableStreamsEnv, streamId: string): string {
  const serviceId = env.DURABLE_STREAMS_SERVICE_ID?.trim();
  if (!serviceId) {
    throw new Error("Missing DURABLE_STREAMS_SERVICE_ID");
  }

  const encodedPath = streamId
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${DURABLE_STREAMS_BASE_URL}/v1/stream/${encodeURIComponent(serviceId)}/${encodedPath}`;
}

function buildHeaders(env: DurableStreamsEnv): Record<string, string> {
  const secret = env.DURABLE_STREAMS_SECRET?.trim();
  if (!secret) {
    throw new Error("Missing DURABLE_STREAMS_SECRET");
  }
  return { Authorization: `Bearer ${secret}` };
}

function buildTaskEventsStreamId(args: { organizationId: string; taskId: string }): string {
  return `org/${args.organizationId}/tasks/${args.taskId}/events`;
}

interface CreateStreamProps {
  env: DurableStreamsEnv;
  organizationId: string;
  taskId: string;
}

export async function createStream({
  env,
  organizationId,
  taskId,
}: CreateStreamProps): Promise<string> {
  const streamId = buildTaskEventsStreamId({ organizationId, taskId });
  const streamUrl = buildStreamUrl(env, streamId);
  const headers = buildHeaders(env);
  try {
    await DurableStream.create({ url: streamUrl, headers, contentType: "application/json" });
    return streamId;
  } catch (error) {
    if (error instanceof DurableStreamError && error.code === "CONFLICT_EXISTS") {
      return streamId;
    }
    throw error;
  }
}

export async function appendTaskEventToDurableStream(args: {
  env: DurableStreamsEnv;
  organizationId: string;
  taskId: string;
  event: TaskStreamEventBase & { kind: TaskStreamEventKind; payload: string };
}): Promise<void> {
  const { env, organizationId, taskId, event } = args;

  if (!isDurableStreamsConfigured(env)) {
    return;
  }

  const streamPath = buildTaskEventsStreamId({ organizationId, taskId });
  const url = buildStreamUrl(env, streamPath);

  try {
    const handle = new DurableStream({
      url,
      headers: buildHeaders(env),
      contentType: "application/json",
      batching: false,
    });
    await handle.append(JSON.stringify(event));
  } catch (error) {
    console.warn("Failed to append task event to durable stream", {
      organizationId,
      taskId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function openTaskEventsSse(args: {
  env: DurableStreamsEnv;
  streamId: string;
  offset: string;
}): Promise<Response> {
  const { env, streamId, offset } = args;

  if (!isDurableStreamsConfigured(env)) {
    throw new Error("Durable Streams is not configured");
  }

  const url = buildStreamUrl(env, streamId);

  const readUrl = new URL(url);
  readUrl.searchParams.set("offset", offset);
  readUrl.searchParams.set("live", "sse");

  return fetch(readUrl.toString(), {
    method: "GET",
    headers: {
      ...buildHeaders(env),
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}

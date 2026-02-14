export type DurableStreamsEnv = {
  DURABLE_STREAMS_SERVICE_ID?: string;
  DURABLE_STREAMS_SECRET?: string;
};

export interface TaskEventStreamMessage {
  id: string;
  taskId: string;
  runId: string;
  kind: string;
  payload: string;
  createdAt: number;
}

const DURABLE_STREAMS_BASE_URL = "https://api.electric-sql.cloud";
const TASK_EVENTS_CONTENT_TYPE = "application/json";

function isDurableStreamsConfigured(env: DurableStreamsEnv): boolean {
  return (
    typeof env.DURABLE_STREAMS_SERVICE_ID === "string" &&
    env.DURABLE_STREAMS_SERVICE_ID.trim().length > 0 &&
    typeof env.DURABLE_STREAMS_SECRET === "string" &&
    env.DURABLE_STREAMS_SECRET.trim().length > 0
  );
}

function buildTaskEventsStreamPath(args: { organizationId: string; taskId: string }): string {
  const { organizationId, taskId } = args;
  return `org/${organizationId}/tasks/${taskId}/events`;
}

export async function appendTaskEventToDurableStream(args: {
  env: DurableStreamsEnv;
  organizationId: string;
  taskId: string;
  event: TaskEventStreamMessage;
}): Promise<void> {
  const { env, organizationId, taskId, event } = args;

  if (!isDurableStreamsConfigured(env)) {
    return;
  }

  const streamPath = buildTaskEventsStreamPath({ organizationId, taskId });
  const streamUrl = buildDurableStreamUrl(env, streamPath);

  const ensured = await ensureDurableStream(env, streamUrl);
  if (!ensured) {
    return;
  }

  const appendResponse = await fetch(streamUrl.toString(), {
    method: "POST",
    headers: {
      Authorization: buildAuthorizationHeader(env),
      "Content-Type": TASK_EVENTS_CONTENT_TYPE,
    },
    body: JSON.stringify(event),
  });

  if (!appendResponse.ok) {
    const details = (await appendResponse.text()).trim();
    console.warn("Failed to append task event to durable stream", {
      organizationId,
      taskId,
      status: appendResponse.status,
      statusText: appendResponse.statusText,
      details,
    });
  }
}

export async function openTaskEventsSse(args: {
  env: DurableStreamsEnv;
  organizationId: string;
  taskId: string;
  offset: string;
}): Promise<Response> {
  const { env, organizationId, taskId, offset } = args;

  if (!isDurableStreamsConfigured(env)) {
    throw new Error("Durable Streams is not configured");
  }

  const streamPath = buildTaskEventsStreamPath({ organizationId, taskId });
  const streamUrl = buildDurableStreamUrl(env, streamPath);

  // Ensure stream exists so first subscribers don't get 404 before the first run event.
  await ensureDurableStream(env, streamUrl);

  const readUrl = new URL(streamUrl);
  readUrl.searchParams.set("offset", offset);
  readUrl.searchParams.set("live", "sse");

  return fetch(readUrl.toString(), {
    method: "GET",
    headers: {
      Authorization: buildAuthorizationHeader(env),
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}

function buildDurableStreamUrl(env: DurableStreamsEnv, streamPath: string): URL {
  const serviceId = env.DURABLE_STREAMS_SERVICE_ID?.trim();
  if (!serviceId) {
    throw new Error("Missing DURABLE_STREAMS_SERVICE_ID");
  }

  const encodedPath = streamPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return new URL(
    `/v1/stream/${encodeURIComponent(serviceId)}/${encodedPath}`,
    DURABLE_STREAMS_BASE_URL,
  );
}

function buildAuthorizationHeader(env: DurableStreamsEnv): string {
  const secret = env.DURABLE_STREAMS_SECRET?.trim();
  if (!secret) {
    throw new Error("Missing DURABLE_STREAMS_SECRET");
  }

  return `Bearer ${secret}`;
}

async function ensureDurableStream(env: DurableStreamsEnv, streamUrl: URL): Promise<boolean> {
  const response = await fetch(streamUrl.toString(), {
    method: "PUT",
    headers: {
      Authorization: buildAuthorizationHeader(env),
      "Content-Type": TASK_EVENTS_CONTENT_TYPE,
    },
  });

  if (response.status === 200 || response.status === 201) {
    return true;
  }

  const details = (await response.text()).trim();
  console.warn("Failed to ensure durable stream", {
    url: streamUrl.toString(),
    status: response.status,
    statusText: response.statusText,
    details,
  });
  return false;
}

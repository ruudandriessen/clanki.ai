import type { Event as OpenCodeEvent } from "@opencode-ai/sdk";

/**
 * Wire-format event from the durable task event stream.
 *
 * `kind` is one of:
 * - `"assistant"` – plain-text assistant output (payload is the text)
 * - `"opencode.<Event.type>"` – an OpenCode SDK event (payload is the
 *   JSON-stringified `Event` object)
 */
export type TaskStreamEvent = TaskStreamEventBase &
  (AssistantEventBody | OpenCodeEventBody | TaskLifecycleEventBody);

export type TaskStreamEventBase = {
  id: string;
  taskId: string;
  runId: string;
  createdAt: number;
};

type AssistantEventBody = {
  kind: "assistant";
  payload: string;
};

type OpenCodeEventBody = {
  kind: `opencode.${OpenCodeEvent["type"]}`;
  payload: string;
};

type TaskLifecyclePhase = "runner" | "clone" | "setup" | "assistant";
type TaskLifecycleStatus = "running" | "completed" | "skipped" | "error";

export type TaskLifecycleEventPayload = {
  phase: TaskLifecyclePhase;
  status: TaskLifecycleStatus;
  message: string;
  details?: string;
};

type TaskLifecycleEventBody = {
  kind: "task.lifecycle";
  payload: string;
};

/**
 * Parse the JSON payload of an `opencode.*` event into the appropriate
 * OpenCode SDK {@link Event} type.  Returns `null` when the payload cannot be
 * parsed or the event kind is not an opencode event.
 */
export function parseOpenCodeEventPayload(event: TaskStreamEvent): OpenCodeEvent | null {
  if (event.kind === "assistant") {
    return null;
  }

  if (event.kind === "task.lifecycle") {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(event.payload);
    if (
      parsed &&
      typeof parsed === "object" &&
      "type" in parsed &&
      typeof parsed.type === "string" &&
      "properties" in parsed
    ) {
      return parsed as OpenCodeEvent;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseTaskLifecycleEventPayload(
  event: TaskStreamEvent,
): TaskLifecycleEventPayload | null {
  if (event.kind !== "task.lifecycle") {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(event.payload);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("phase" in parsed) ||
      !("status" in parsed) ||
      !("message" in parsed)
    ) {
      return null;
    }

    const phase = (parsed as Record<string, unknown>).phase;
    const status = (parsed as Record<string, unknown>).status;
    const message = (parsed as Record<string, unknown>).message;
    const details = (parsed as Record<string, unknown>).details;

    if (
      (phase !== "runner" && phase !== "clone" && phase !== "setup" && phase !== "assistant") ||
      (status !== "running" &&
        status !== "completed" &&
        status !== "skipped" &&
        status !== "error") ||
      typeof message !== "string"
    ) {
      return null;
    }

    if (details !== undefined && typeof details !== "string") {
      return null;
    }

    return {
      phase,
      status,
      message,
      details,
    };
  } catch {
    return null;
  }
}

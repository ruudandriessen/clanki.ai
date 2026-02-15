import type { Event as OpenCodeEvent } from "@opencode-ai/sdk";

/**
 * Wire-format event from the durable task event stream.
 *
 * `kind` is one of:
 * - `"assistant"` – plain-text assistant output (payload is the text)
 * - `"opencode.<Event.type>"` – an OpenCode SDK event (payload is the
 *   JSON-stringified `Event` object)
 */
export type TaskStreamEvent = TaskStreamEventBase & (AssistantEventBody | OpenCodeEventBody);

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

/** All possible `kind` values. */
export type TaskStreamEventKind = TaskStreamEvent["kind"];

/**
 * Parse the JSON payload of an `opencode.*` event into the appropriate
 * OpenCode SDK {@link Event} type.  Returns `null` when the payload cannot be
 * parsed or the event kind is not an opencode event.
 */
export function parseOpenCodeEventPayload(event: TaskStreamEvent): OpenCodeEvent | null {
  if (event.kind === "assistant") {
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

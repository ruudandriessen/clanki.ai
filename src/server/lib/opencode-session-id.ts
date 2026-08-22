import { SESSION_ID_EVENT } from "@tanstack/ai-opencode";
import type { StreamChunk } from "@tanstack/ai";

export function readOpencodeSessionId(chunk: StreamChunk): string | null {
  if (chunk.type !== "CUSTOM" || chunk.name !== SESSION_ID_EVENT) {
    return null;
  }

  if (!chunk.value || typeof chunk.value !== "object") {
    return null;
  }

  const sessionId = (chunk.value as { sessionId?: unknown }).sessionId;
  return typeof sessionId === "string" && sessionId.trim().length > 0 ? sessionId.trim() : null;
}

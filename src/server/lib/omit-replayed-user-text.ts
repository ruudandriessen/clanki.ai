import { defineChatMiddleware } from "@tanstack/ai";
import type { ModelMessage, StreamChunk } from "@tanstack/ai";

export function omitReplayedUserText() {
  const droppedMessageIds = new Set<string>();
  const heldStarts = new Map<string, StreamChunk>();

  return defineChatMiddleware({
    name: "omit-replayed-user-text",
    onChunk(ctx, chunk) {
      if (chunk.type === "TEXT_MESSAGE_START") {
        if (chunk.role === "user") {
          droppedMessageIds.add(chunk.messageId);
          return null;
        }

        heldStarts.set(chunk.messageId, chunk);
        return null;
      }

      if (chunk.type === "TEXT_MESSAGE_CONTENT") {
        if (droppedMessageIds.has(chunk.messageId)) {
          return null;
        }

        const lastUserText = lastUserMessageText(ctx.messages);
        if (lastUserText.length > 0 && chunk.delta.trim() === lastUserText) {
          droppedMessageIds.add(chunk.messageId);
          heldStarts.delete(chunk.messageId);
          return null;
        }

        const heldStart = heldStarts.get(chunk.messageId);
        heldStarts.delete(chunk.messageId);
        return heldStart ? [heldStart, chunk] : chunk;
      }

      if (chunk.type === "TEXT_MESSAGE_END") {
        if (droppedMessageIds.delete(chunk.messageId)) {
          return null;
        }

        const heldStart = heldStarts.get(chunk.messageId);
        heldStarts.delete(chunk.messageId);
        return heldStart ? [heldStart, chunk] : chunk;
      }

      return chunk;
    },
  });
}

export function lastUserMessageText(messages: ReadonlyArray<ModelMessage>): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") {
      continue;
    }

    return modelMessageText(message).trim();
  }

  return "";
}

function modelMessageText(message: ModelMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }

  if (!Array.isArray(message.content)) {
    return "";
  }

  let text = "";
  for (const part of message.content) {
    if (part.type === "text") {
      text += part.content;
    }
  }

  return text;
}

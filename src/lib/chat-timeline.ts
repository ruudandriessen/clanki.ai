import type { UIMessage } from "@tanstack/ai-react";
import type { TaskStreamActivityItem } from "@/components/task-stream-activity";
import { getToolActivityIcon } from "@/lib/chat-tool-activity";
import { buildToolActivityPresentation } from "@/lib/tool-activity-summary";

export type TimelineEntry =
  | {
      type: "message";
      id: string;
      createdAt: number;
      role: string;
      content: string;
    }
  | {
      type: "activity";
      id: string;
      createdAt: number;
      item: TaskStreamActivityItem;
    }
  | {
      type: "activity-group";
      id: string;
      createdAt: number;
      items: TaskStreamActivityItem[];
    };

export function buildChatTimeline(args: {
  isLoading: boolean;
  messages: UIMessage[];
}): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (let messageIndex = 0; messageIndex < args.messages.length; messageIndex += 1) {
    const message = args.messages[messageIndex];
    const createdAt = messageCreatedAt(message, messageIndex);
    const isLastMessage = messageIndex === args.messages.length - 1;

    if (message.role === "user") {
      const content = textFromMessage(message);
      if (content.length === 0) {
        continue;
      }

      entries.push({
        type: "message",
        id: message.id,
        createdAt,
        role: "user",
        content,
      });
      continue;
    }

    if (message.role !== "assistant") {
      continue;
    }

    let textBuffer = "";
    let textPartIndex = 0;

    const flushText = () => {
      const content = textBuffer.trim();
      if (content.length === 0) {
        textBuffer = "";
        return;
      }

      entries.push({
        type: "message",
        id: `${message.id}:text:${textPartIndex}`,
        createdAt,
        role: "assistant",
        content,
      });
      textPartIndex += 1;
      textBuffer = "";
    };

    for (let partIndex = 0; partIndex < message.parts.length; partIndex += 1) {
      const part = message.parts[partIndex];

      if (part.type === "text") {
        textBuffer += part.content;
        continue;
      }

      flushText();

      if (part.type === "thinking") {
        const hasLaterContent = message.parts
          .slice(partIndex + 1)
          .some((candidate) => candidate.type === "text" || candidate.type === "tool-call");
        const spinning = args.isLoading && isLastMessage && !hasLaterContent;

        entries.push({
          type: "activity",
          id: `${message.id}:thinking:${partIndex}`,
          createdAt,
          item: {
            id: `${message.id}:thinking:${partIndex}`,
            icon: "thinking",
            label: spinning ? "Thinking" : "Thought complete",
            tone: "muted",
            spinning,
          },
        });
        continue;
      }

      if (part.type === "tool-call") {
        const status = toolCallStatus(part.state);
        const presentation = buildToolActivityPresentation({
          toolName: part.name,
          status,
          state: {
            input: part.input,
            output: part.output,
            error: status === "error" ? part.output : undefined,
          },
        });

        entries.push({
          type: "activity",
          id: `${message.id}:tool:${part.id}`,
          createdAt,
          item: {
            id: `${message.id}:tool:${part.id}`,
            icon: getToolActivityIcon(part.name),
            label: presentation.label,
            summary: presentation.summary,
            badges: presentation.badges,
            details: presentation.details,
            detailSections: presentation.detailSections,
            tone: status === "error" ? "error" : status === "completed" ? "success" : "muted",
            spinning: status === "running" || status === "pending",
          },
        });
      }
    }

    flushText();
  }

  return groupTimelineActivities(entries);
}

export function getLatestUserMessageCreatedAt(messages: UIMessage[]): number | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") {
      continue;
    }

    return messageCreatedAt(message, index);
  }

  return null;
}

function groupTimelineActivities(entries: TimelineEntry[]): TimelineEntry[] {
  const result: TimelineEntry[] = [];
  let pendingActivities: Array<TimelineEntry & { type: "activity" }> = [];

  for (const entry of entries) {
    if (entry.type === "activity") {
      pendingActivities.push(entry);
      continue;
    }

    if (pendingActivities.length > 0) {
      if (entry.type === "message" && entry.role === "assistant") {
        result.push({
          type: "activity-group",
          id: `group-${pendingActivities[0].id}`,
          createdAt: pendingActivities[0].createdAt,
          items: pendingActivities.map((activity) => activity.item),
        });
      } else {
        for (const activity of pendingActivities) {
          result.push(activity);
        }
      }
      pendingActivities = [];
    }

    result.push(entry);
  }

  for (const activity of pendingActivities) {
    result.push(activity);
  }

  return result;
}

function textFromMessage(message: UIMessage): string {
  return message.parts
    .filter(
      (part): part is Extract<UIMessage["parts"][number], { type: "text" }> => part.type === "text",
    )
    .map((part) => part.content)
    .join("")
    .trim();
}

function messageCreatedAt(message: UIMessage, fallbackIndex: number): number {
  if (message.createdAt instanceof Date) {
    return message.createdAt.getTime();
  }

  return fallbackIndex;
}

function toolCallStatus(state: string): "completed" | "running" | "pending" | "error" {
  switch (state) {
    case "complete":
      return "completed";
    case "error":
      return "error";
    case "awaiting-input":
      return "pending";
    default:
      return "running";
  }
}

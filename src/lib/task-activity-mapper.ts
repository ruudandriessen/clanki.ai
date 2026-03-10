import type { TaskStreamActivityIcon } from "@/components/task-stream-activity";
import { buildToolActivityPresentation } from "@/lib/tool-activity-summary";
import type { ChronologicalActivityItem } from "@/lib/task-timeline";
import {
  type TaskStreamEvent,
  type TaskLifecycleEventPayload,
  parseOpenCodeEventPayload,
  parseTaskLifecycleEventPayload,
} from "@/shared/task-stream-events";
import type { Event as OpenCodeEvent } from "@opencode-ai/sdk";

export function toTaskStreamActivityItem(event: TaskStreamEvent): ChronologicalActivityItem | null {
  if (event.kind === "assistant") {
    return null;
  }

  if (event.kind === "task.lifecycle") {
    const lifecycle = parseTaskLifecycleEventPayload(event);
    if (!lifecycle) {
      return null;
    }

    return taskLifecycleToActivityItem(event, lifecycle);
  }

  const parsed = parseOpenCodeEventPayload(event);
  if (!parsed) {
    return null;
  }

  return openCodeEventToActivityItem(event, parsed);
}

function taskLifecycleToActivityItem(
  event: TaskStreamEvent,
  lifecycle: TaskLifecycleEventPayload,
): ChronologicalActivityItem {
  const details = lifecycle.details ? [`Command: ${lifecycle.details}`] : undefined;

  return {
    id: event.id,
    stateKey: `lifecycle:${lifecycle.phase}`,
    icon: getLifecycleActivityIcon(lifecycle),
    label: `${getLifecyclePhaseLabel(lifecycle.phase)}: ${lifecycle.message}`,
    details,
    tone: getLifecycleActivityTone(lifecycle.status),
    spinning: lifecycle.status === "running",
    createdAt: event.createdAt,
  };
}

function getLifecyclePhaseLabel(phase: TaskLifecycleEventPayload["phase"]): string {
  switch (phase) {
    case "runner":
      return "Runner";
    case "clone":
      return "Git clone";
    case "setup":
      return "Project setup";
    case "assistant":
      return "Assistant";
  }
}

function getLifecycleActivityIcon(lifecycle: TaskLifecycleEventPayload): TaskStreamActivityIcon {
  switch (lifecycle.phase) {
    case "clone":
      return "web";
    case "setup":
      return "terminal";
    case "assistant":
      return lifecycle.status === "completed" ? "success" : "status";
    case "runner":
    default:
      return "status";
  }
}

function getLifecycleActivityTone(
  status: TaskLifecycleEventPayload["status"],
): ChronologicalActivityItem["tone"] {
  switch (status) {
    case "completed":
      return "success";
    case "error":
      return "error";
    default:
      return "muted";
  }
}

function openCodeEventToActivityItem(
  event: TaskStreamEvent,
  parsed: OpenCodeEvent,
): ChronologicalActivityItem | null {
  if (parsed.type === "message.part.updated") {
    return messagePartToActivityItem(event, parsed);
  }

  if (parsed.type === "command.executed") {
    const { name, arguments: args } = parsed.properties;
    const details: string[] = [];
    appendDetail(details, "Arguments", args, 300);

    return {
      id: event.id,
      stateKey: `command:${event.id}`,
      icon: "terminal",
      label: `Command: ${name}`,
      details: details.length > 0 ? details : undefined,
      tone: "muted",
      createdAt: event.createdAt,
    };
  }

  if (parsed.type === "session.status") {
    const { sessionID, status } = parsed.properties;
    const details: string[] = [];

    if (status.type === "retry") {
      appendDetail(details, "Attempt", status.attempt);
      appendDetail(details, "Reason", status.message);
    }

    return {
      id: event.id,
      stateKey: `session:${sessionID}`,
      icon: status.type === "idle" ? "success" : "status",
      label: status.type === "idle" ? "Session idle" : `Session ${status.type}`,
      details: details.length > 0 ? details : undefined,
      tone: "muted",
      spinning: status.type === "busy",
      createdAt: event.createdAt,
    };
  }

  if (parsed.type === "session.error") {
    const { sessionID, error } = parsed.properties;
    const message = getErrorMessage(error) ?? "Session error";
    const details: string[] = [];
    appendDetail(details, "Error type", getErrorName(error));

    return {
      id: event.id,
      stateKey: `session:${sessionID ?? "default"}`,
      icon: "error",
      label: message,
      details: details.length > 0 ? details : undefined,
      tone: "error",
      createdAt: event.createdAt,
    };
  }

  if (parsed.type === "permission.updated") {
    const permission = parsed.properties;
    const details: string[] = [];
    appendDetail(details, "Type", permission.type);
    appendDetail(details, "Pattern", formatPermissionPattern(permission.pattern));

    return {
      id: event.id,
      stateKey: `permission:${permission.id ?? permission.title ?? "default"}`,
      icon: "permission",
      label: permission.title ?? "Permission requested",
      details: details.length > 0 ? details : undefined,
      tone: "muted",
      createdAt: event.createdAt,
    };
  }

  if (parsed.type === "permission.replied") {
    const { permissionID, response } = parsed.properties;

    return {
      id: event.id,
      stateKey: `permission:${permissionID ?? "default"}`,
      icon: "permission",
      label: `Permission: ${response}`,
      tone: "muted",
      createdAt: event.createdAt,
    };
  }

  if (parsed.type === "todo.updated") {
    const { todos } = parsed.properties;
    const details: string[] = [];
    appendDetail(details, "Status", summarizeTodoStatusCounts(todos));
    const focusTodo =
      todos.find((todo) => todo.status === "in_progress") ??
      todos.find((todo) => todo.status === "pending");
    appendDetail(details, "Focus", focusTodo?.content);

    return {
      id: event.id,
      stateKey: "todo-list",
      icon: "tool",
      label: `Todo list updated (${todos.length})`,
      details: details.length > 0 ? details : undefined,
      tone: "muted",
      createdAt: event.createdAt,
    };
  }

  return null;
}

function messagePartToActivityItem(
  event: TaskStreamEvent,
  parsed: Extract<OpenCodeEvent, { type: "message.part.updated" }>,
): ChronologicalActivityItem | null {
  const { part } = parsed.properties;

  if (part.type === "reasoning") {
    const isComplete = typeof part.time.end === "number";

    return {
      id: event.id,
      stateKey: `reasoning:${part.id ?? part.messageID}`,
      icon: "thinking",
      label: isComplete ? "Thought complete" : "Thinking",
      tone: "muted",
      spinning: !isComplete,
      createdAt: event.createdAt,
    };
  }

  if (part.type === "step-start") {
    const stepKey = part.snapshot ?? part.messageID;

    return {
      id: event.id,
      stateKey: `step:${stepKey}`,
      icon: "thinking",
      label: "Step: started",
      tone: "muted",
      createdAt: event.createdAt,
    };
  }

  if (part.type === "step-finish") {
    const stepKey = part.snapshot ?? part.messageID;

    return {
      id: event.id,
      stateKey: `step:${stepKey}`,
      icon: "thinking",
      label: "Step: complete",
      tone: "muted",
      createdAt: event.createdAt,
    };
  }

  if (part.type === "tool") {
    const toolName = part.tool;
    const status = part.state.status;
    const callId = part.callID ?? part.id;
    const presentation = buildToolActivityPresentation({
      toolName,
      status,
      state: part.state,
    });
    const details = [...(presentation.details ?? [])];
    const attachmentCount = part.state.attachments?.length ?? 0;

    if (attachmentCount > 0) {
      details.push(`Attachments: ${attachmentCount}`);
    }

    return {
      id: event.id,
      stateKey: `tool:${callId}`,
      icon: getToolActivityIcon(toolName),
      label: presentation.label,
      summary: presentation.summary,
      badges: presentation.badges,
      details: details.length > 0 ? details : undefined,
      detailSections: presentation.detailSections,
      tone: status === "error" ? "error" : status === "completed" ? "success" : "muted",
      spinning: status === "running",
      createdAt: event.createdAt,
    };
  }

  return null;
}

function appendDetail(details: string[], key: string, value: unknown, maxLength = 220): void {
  const formatted = formatDetailValue(value, maxLength);
  if (!formatted) {
    return;
  }

  details.push(`${key}: ${formatted}`);
}

function formatDetailValue(value: unknown, maxLength = 220): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const normalized = value.trim().replace(/\s+/g, " ");
    if (normalized.length === 0) {
      return null;
    }
    return truncateText(normalized, maxLength);
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return null;
    }

    const values = value
      .map((item) => formatDetailValue(item, Math.floor(maxLength / 2)) ?? "")
      .filter((item) => item.length > 0);

    if (values.length === 0) {
      return null;
    }

    const rendered = values.slice(0, 5).join(", ");
    const suffix = values.length > 5 ? ", ..." : "";
    return truncateText(`${rendered}${suffix}`, maxLength);
  }

  if (typeof value === "object") {
    return formatObjectDetailValue(value as Record<string, unknown>, maxLength);
  }

  return null;
}

function formatObjectDetailValue(value: Record<string, unknown>, maxLength: number): string | null {
  const entries = Object.entries(value).filter(([key, entryValue]) => {
    if (entryValue === null || entryValue === undefined) {
      return false;
    }

    return !isHiddenDetailKey(key);
  });

  if (entries.length === 0) {
    return null;
  }

  const summary = entries
    .slice(0, 5)
    .map(([key, entryValue]) => {
      const formattedValue = formatDetailValue(entryValue, 90);
      if (!formattedValue) {
        return null;
      }

      return `${toDisplayKey(key)}: ${formattedValue}`;
    })
    .filter((entry): entry is string => entry !== null);

  if (summary.length === 0) {
    return null;
  }

  const suffix = entries.length > 5 ? ", ..." : "";
  return truncateText(`${summary.join(", ")}${suffix}`, maxLength);
}

function isHiddenDetailKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  return (
    normalized === "id" ||
    normalized === "sessionid" ||
    normalized === "messageid" ||
    normalized === "callid"
  );
}

function toDisplayKey(key: string): string {
  const separated = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .trim();
  const normalized = separated.toLowerCase();
  if (normalized.length === 0) {
    return "";
  }

  return `${normalized[0]?.toUpperCase() ?? ""}${normalized.slice(1)}`;
}

function truncateText(value: string, maxLength = 220): string {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 3) {
    return value.slice(0, maxLength);
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function getErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const candidateData = (error as Record<string, unknown>).data;
  if (!candidateData || typeof candidateData !== "object") {
    return null;
  }

  const candidateMessage = (candidateData as Record<string, unknown>).message;
  return typeof candidateMessage === "string" ? candidateMessage : null;
}

function getErrorName(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const candidateName = (error as Record<string, unknown>).name;
  return typeof candidateName === "string" ? candidateName : null;
}

function formatPermissionPattern(pattern: string | string[] | undefined): string | null {
  if (!pattern) {
    return null;
  }

  if (typeof pattern === "string") {
    return truncateText(pattern, 220);
  }

  if (pattern.length === 0) {
    return null;
  }

  return truncateText(pattern.join(", "), 220);
}

function summarizeTodoStatusCounts(todos: Array<{ status: string }>): string {
  const counts = new Map<string, number>();
  for (const todo of todos) {
    counts.set(todo.status, (counts.get(todo.status) ?? 0) + 1);
  }

  const orderedStatuses = ["in_progress", "pending", "completed", "cancelled"];
  const summary: string[] = [];

  for (const status of orderedStatuses) {
    const count = counts.get(status) ?? 0;
    if (count > 0) {
      summary.push(`${status} ${count}`);
      counts.delete(status);
    }
  }

  const remainingEntries = Array.from(counts.entries()).toSorted((a, b) =>
    a[0].localeCompare(b[0]),
  );
  for (const [status, count] of remainingEntries) {
    summary.push(`${status} ${count}`);
  }

  return summary.join(", ");
}

function getToolActivityIcon(toolName: string): TaskStreamActivityIcon {
  const normalized = toolName.toLowerCase();

  if (
    normalized.includes("read") ||
    normalized.includes("file") ||
    normalized.includes("glob") ||
    normalized.includes("grep") ||
    normalized.includes("find") ||
    normalized.includes("ls")
  ) {
    return "file";
  }

  if (normalized.includes("web") || normalized.includes("search") || normalized.includes("fetch")) {
    return "web";
  }

  if (
    normalized.includes("command") ||
    normalized.includes("exec") ||
    normalized.includes("bash") ||
    normalized.includes("shell")
  ) {
    return "terminal";
  }

  return "tool";
}

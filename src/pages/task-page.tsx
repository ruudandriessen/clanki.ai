import { useEffect, useRef, useState } from "react";
import { useLiveQuery, eq } from "@tanstack/react-db";
import { AlertCircle, ChevronRight, ExternalLink, Loader2, Send, Wrench } from "lucide-react";
import {
  TaskStreamActivity,
  type TaskStreamActivityIcon,
  type TaskStreamActivityItem,
} from "@/components/task-stream-activity";
import { MarkdownContent } from "@/components/markdown-content";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sessionStateKeys, useSessionState } from "@/lib/session-state";
import { cn } from "@/lib/utils";
import type { Event as OpenCodeEvent } from "@opencode-ai/sdk";
import { taskMessagesCollection, tasksCollection } from "../lib/collections";
import { useTaskEventStream } from "../lib/use-task-event-stream";
import {
  TaskStreamEvent,
  parseOpenCodeEventPayload,
  parseTaskLifecycleEventPayload,
  TaskLifecycleEventPayload,
} from "@/shared/task-stream-events";

function CollapsedActivityGroup({ items }: { items: TaskStreamActivityItem[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 px-1 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronRight
            className={cn("h-3.5 w-3.5 shrink-0 transition-transform", expanded && "rotate-90")}
          />
          <Wrench className="h-3.5 w-3.5 shrink-0" />
          <span>
            {items.length} tool {items.length === 1 ? "call" : "calls"}
          </span>
        </button>
        {expanded ? (
          <div className="mt-1.5 ml-2.5">
            <TaskStreamActivity items={items} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface TaskPageProps {
  taskId: string;
  projectName: string;
  streamId: string | null;
  branchName: string | null;
  pullRequest: {
    prNumber: number;
    url: string;
    status: "open" | "merged" | "closed" | "draft";
    reviewState: string | null;
    checksState: string | null;
    checksConclusion: string | null;
  } | null;
  title: string;
  error: string | null;
  isRunning: boolean;
}

function getPullRequestButtonClasses(status: "open" | "merged" | "closed" | "draft"): string {
  switch (status) {
    case "merged":
      return "border-[#8250df] bg-[#8250df] text-white hover:border-[#6f42c1] hover:bg-[#6f42c1]";
    case "closed":
      return "border-[#cf222e] bg-[#cf222e] text-white hover:border-[#a40e26] hover:bg-[#a40e26]";
    case "draft":
      return "border-[#6e7781] bg-[#6e7781] text-white hover:border-[#57606a] hover:bg-[#57606a]";
    default:
      return "";
  }
}

function humanizePullRequestStatus(status: string | null): string {
  if (!status) {
    return "unknown";
  }

  return status.replaceAll("_", " ");
}

function getReviewStatusClasses(reviewState: string | null): string {
  switch (reviewState) {
    case "approved":
      return "border-emerald-300 bg-emerald-100 text-emerald-900";
    case "changes_requested":
      return "border-red-300 bg-red-100 text-red-900";
    case "dismissed":
      return "border-zinc-300 bg-zinc-100 text-zinc-800";
    default:
      return "border-border bg-card text-muted-foreground";
  }
}

function getChecksStatusClasses(
  checksState: string | null,
  checksConclusion: string | null,
): string {
  switch (checksConclusion) {
    case "success":
      return "border-emerald-300 bg-emerald-100 text-emerald-900";
    case "failure":
    case "cancelled":
    case "timed_out":
    case "action_required":
    case "startup_failure":
    case "stale":
      return "border-red-300 bg-red-100 text-red-900";
  }

  switch (checksState) {
    case "queued":
    case "in_progress":
    case "requested":
    case "pending":
    case "waiting":
      return "border-amber-300 bg-amber-100 text-amber-900";
    default:
      return "border-border bg-card text-muted-foreground";
  }
}

function formatChecksStatus(checksState: string | null, checksConclusion: string | null): string {
  if (checksState && checksConclusion) {
    return `${humanizePullRequestStatus(checksState)} (${humanizePullRequestStatus(checksConclusion)})`;
  }

  return humanizePullRequestStatus(checksState ?? checksConclusion);
}

export function TaskPage({
  taskId,
  title,
  branchName,
  projectName,
  streamId,
  pullRequest,
  error,
  isRunning,
}: TaskPageProps) {
  const displayTitle = branchName ?? title;
  const [input, setInput] = useSessionState(sessionStateKeys.taskInput(taskId), "");
  const [sending, setSending] = useState(false);
  const runEvents = useTaskEventStream({ taskId, streamId });
  const [now, setNow] = useState(() => Date.now());
  const messageListRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const shouldStickToBottomRef = useRef(true);

  const { data: messages, isLoading } = useLiveQuery(
    (q) =>
      q
        .from({ m: taskMessagesCollection })
        .where(({ m }) => eq(m.task_id, taskId))
        .orderBy(({ m }) => m.created_at, "asc"),
    [taskId],
  );

  const persistedAssistantMessage = getLatestAssistantMessage(messages);
  const streamAssistantPreview = getLatestStreamAssistantPreview(runEvents);
  const streamActivityItems = buildTaskStreamActivityItems(runEvents);
  const timelineEntries = buildChronologicalTimeline({
    messages,
    activityItems: streamActivityItems,
    streamAssistantPreview,
    persistedAssistantMessage,
  });
  const showEmptyState = timelineEntries.length === 0;
  const runStartedAt = getLatestUserMessageCreatedAt(messages);
  const runningDurationMs =
    isRunning && runStartedAt !== null ? Math.max(0, now - runStartedAt) : null;

  useEffect(() => {
    if (!shouldStickToBottomRef.current) {
      return;
    }

    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, runEvents]);

  useEffect(() => {
    shouldStickToBottomRef.current = true;
  }, [taskId]);

  useEffect(() => {
    if (isLoading || messages.length > 0) {
      return;
    }

    inputRef.current?.focus();
  }, [taskId, isLoading, messages.length]);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const timerId = globalThis.setInterval(() => {
      setNow(Date.now());
    }, 1_000);

    return () => {
      globalThis.clearInterval(timerId);
    };
  }, [isRunning]);

  async function handleSend() {
    const content = input.trim();
    if (!content || sending || isRunning || !taskId) return;

    shouldStickToBottomRef.current = true;
    setSending(true);
    setInput("");

    try {
      const optimisticUpdatedAt = BigInt(Date.now());
      tasksCollection.update(taskId, (draft) => {
        draft.status = "running";
        draft.error = null;
        draft.updated_at = optimisticUpdatedAt;
      });

      const userMessage = {
        id: crypto.randomUUID(),
        task_id: taskId,
        role: "user",
        content,
        created_at: optimisticUpdatedAt,
      };
      const messageTx = taskMessagesCollection.insert(userMessage);
      await messageTx.isPersisted.promise;
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  function handleMessageListScroll() {
    const container = messageListRef.current;
    if (!container) {
      return;
    }

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom <= 80;
  }

  if (!taskId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Select a task to get started
      </div>
    );
  }

  return (
    <div className="neo-enter flex h-full flex-col">
      <div className="shrink-0 border-b border-border bg-card px-4 py-3 md:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="min-w-0">
              <div className="flex min-h-8 min-w-0 items-center gap-2">
                <h2 className="m-0 truncate text-sm font-bold tracking-[0.04em] uppercase">
                  {displayTitle}
                </h2>
              </div>
              <p className="truncate text-xs text-muted-foreground">{projectName}</p>
            </div>
          </div>
          {pullRequest ? (
            <div className="shrink-0 space-y-1 text-right">
              <Button
                asChild
                variant="outline"
                size="xs"
                className={getPullRequestButtonClasses(pullRequest.status)}
              >
                <a
                  href={pullRequest.url}
                  target="_blank"
                  rel="noreferrer"
                  title={`Open PR #${pullRequest.prNumber} on GitHub`}
                >
                  PR #{pullRequest.prNumber} {pullRequest.status}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
              <div className="flex flex-wrap justify-end gap-1">
                {pullRequest.reviewState != null ? (
                  <span
                    className={cn(
                      "rounded border px-2 py-0.5 text-[11px] font-medium",
                      getReviewStatusClasses(pullRequest.reviewState),
                    )}
                  >
                    Review: {humanizePullRequestStatus(pullRequest.reviewState)}
                  </span>
                ) : null}
                {pullRequest.checksState != null || pullRequest.checksConclusion != null ? (
                  <span
                    className={cn(
                      "rounded border px-2 py-0.5 text-[11px] font-medium",
                      getChecksStatusClasses(pullRequest.checksState, pullRequest.checksConclusion),
                    )}
                  >
                    Checks:{" "}
                    {formatChecksStatus(pullRequest.checksState, pullRequest.checksConclusion)}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-4 py-2.5 md:px-6">
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-words">{error}</span>
          </div>
        </div>
      ) : null}

      <div
        ref={messageListRef}
        onScroll={handleMessageListScroll}
        className="neo-scroll flex-1 overflow-y-auto"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : showEmptyState ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-muted-foreground">
            <p className="text-sm">No messages yet</p>
            <p className="text-xs">Send a message to start an OpenCode run.</p>
          </div>
        ) : (
          <div className="space-y-4 px-4 py-4 md:px-6">
            {timelineEntries.map((entry) => {
              if (entry.type === "activity") {
                return <TaskStreamActivity key={entry.id} items={[entry.item]} />;
              }

              if (entry.type === "activity-group") {
                return <CollapsedActivityGroup key={entry.id} items={entry.items} />;
              }

              if (entry.type === "assistant-preview") {
                return (
                  <div
                    key={entry.id}
                    className="max-w-3xl rounded-[var(--radius-md)] border border-border/70 bg-card/80 p-4"
                  >
                    <MarkdownContent content={entry.content} className="text-foreground" />
                  </div>
                );
              }

              const isUserMessage = entry.role === "user";
              return (
                <div key={entry.id} className={isUserMessage ? "flex justify-end" : ""}>
                  <div
                    className={`${
                      isUserMessage
                        ? "w-fit rounded-[var(--radius-md)] border border-border/60 bg-primary/95 px-4 py-2.5 text-primary-foreground"
                        : "max-w-3xl rounded-[var(--radius-md)] border border-border/70 bg-card/80 px-4 py-2.5 text-foreground"
                    }`}
                  >
                    {isUserMessage ? (
                      <div className="text-sm leading-relaxed whitespace-pre-wrap">
                        {entry.content}
                      </div>
                    ) : (
                      <MarkdownContent content={entry.content} />
                    )}
                  </div>
                </div>
              );
            })}

            {isRunning && (
              <div className="flex items-center gap-2 py-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:-0.3s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:-0.15s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" />
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatDuration(runningDurationMs ?? 0)}
                </span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-card p-4">
        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isRunning ? "Wait for the current run to finish..." : "Send a message..."}
            rows={1}
            disabled={isRunning || sending}
            className="min-h-[42px] max-h-[200px] flex-1 resize-none rounded-[var(--radius-md)] px-4 py-2.5 text-base md:text-sm"
            style={{ height: "auto" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 200) + "px";
            }}
          />
          <Button
            type="button"
            onClick={() => void handleSend()}
            disabled={!input.trim() || sending || isRunning}
            className="h-[42px] w-[42px] shrink-0 rounded-[var(--radius-md)] p-0"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

type AssistantMessageSnapshot = {
  content: string;
  createdAt: number;
};

type ChronologicalActivityItem = TaskStreamActivityItem & {
  stateKey: string;
  createdAt: number;
};

type TimelineEntry =
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
    }
  | {
      type: "assistant-preview";
      id: string;
      createdAt: number;
      content: string;
    };

function getLatestAssistantMessage(
  messages: Array<{ role: string; content: string; created_at: unknown }>,
): AssistantMessageSnapshot | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant") {
      continue;
    }

    const content = message.content.trim();
    const createdAt = toTimestampOrNull(message.created_at);
    if (content.length > 0 && createdAt !== null) {
      return { content, createdAt };
    }
  }

  return null;
}

function getLatestStreamAssistantPreview(
  events: TaskStreamEvent[],
): AssistantMessageSnapshot | null {
  const messageRoleById = new Map<string, string>();
  let latest: AssistantMessageSnapshot | null = null;

  for (const event of events) {
    if (event.kind === "assistant") {
      const content = event.payload.trim();
      if (content.length > 0) {
        latest = { content, createdAt: event.createdAt };
      }
      continue;
    }

    const parsed = parseOpenCodeEventPayload(event);
    if (!parsed) {
      continue;
    }

    if (parsed.type === "message.updated") {
      const { info } = parsed.properties;
      if (info.id && info.role) {
        messageRoleById.set(info.id, info.role);
      }
      continue;
    }

    if (parsed.type === "message.part.updated") {
      const { part } = parsed.properties;
      if (part.type !== "text") {
        continue;
      }

      const role = messageRoleById.get(part.messageID);
      if (role !== "assistant") {
        continue;
      }

      if (part.text) {
        latest = { content: part.text, createdAt: event.createdAt };
      }
    }
  }

  return latest;
}

function buildTaskStreamActivityItems(events: TaskStreamEvent[]): ChronologicalActivityItem[] {
  const byStateKey = new Map<string, ChronologicalActivityItem>();
  const orderedStateKeys: string[] = [];

  for (const event of events) {
    const item = toTaskStreamActivityItem(event);
    if (!item) {
      continue;
    }

    const current = byStateKey.get(item.stateKey);
    if (!current) {
      byStateKey.set(item.stateKey, item);
      orderedStateKeys.push(item.stateKey);
      continue;
    }

    byStateKey.set(item.stateKey, {
      ...current,
      ...item,
      id: current.id,
      stateKey: current.stateKey,
      createdAt: current.createdAt,
    });
  }

  return orderedStateKeys
    .map((stateKey) => byStateKey.get(stateKey))
    .filter((item): item is ChronologicalActivityItem => item !== undefined)
    .toSorted((a, b) => a.createdAt - b.createdAt);
}

function buildChronologicalTimeline(args: {
  messages: Array<{ id: string; role: string; content: string; created_at: unknown }>;
  activityItems: ChronologicalActivityItem[];
  streamAssistantPreview: AssistantMessageSnapshot | null;
  persistedAssistantMessage: AssistantMessageSnapshot | null;
}): TimelineEntry[] {
  const sortable: Array<{ order: number; item: TimelineEntry }> = [];
  let order = 0;

  for (const message of args.messages) {
    const createdAt = toTimestampOrNull(message.created_at);
    if (createdAt === null) {
      continue;
    }

    sortable.push({
      order,
      item: {
        type: "message",
        id: message.id,
        createdAt,
        role: message.role,
        content: message.content,
      },
    });
    order += 1;
  }

  for (const activity of args.activityItems) {
    sortable.push({
      order,
      item: {
        type: "activity",
        id: activity.id,
        createdAt: activity.createdAt,
        item: {
          id: activity.id,
          icon: activity.icon,
          label: activity.label,
          details: activity.details,
          tone: activity.tone,
          spinning: activity.spinning,
        },
      },
    });
    order += 1;
  }

  if (
    args.streamAssistantPreview &&
    args.streamAssistantPreview.content !== (args.persistedAssistantMessage?.content ?? "")
  ) {
    sortable.push({
      order,
      item: {
        type: "assistant-preview",
        id: `stream-assistant-${args.streamAssistantPreview.createdAt}`,
        createdAt: args.streamAssistantPreview.createdAt,
        content: args.streamAssistantPreview.content,
      },
    });
  }

  const sorted = sortable.toSorted((a, b) => {
    if (a.item.createdAt === b.item.createdAt) {
      return a.order - b.order;
    }
    return a.item.createdAt - b.item.createdAt;
  });

  return groupTimelineActivities(sorted.map((entry) => entry.item));
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
          items: pendingActivities.map((a) => a.item),
        });
      } else {
        for (const a of pendingActivities) {
          result.push(a);
        }
      }
      pendingActivities = [];
    }

    result.push(entry);
  }

  for (const a of pendingActivities) {
    result.push(a);
  }

  return result;
}

function toTaskStreamActivityItem(event: TaskStreamEvent): ChronologicalActivityItem | null {
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
    case "sandbox":
      return "Sandbox";
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
    case "sandbox":
    default:
      return "status";
  }
}

function getLifecycleActivityTone(
  status: TaskLifecycleEventPayload["status"],
): TaskStreamActivityItem["tone"] {
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
    const details: string[] = [];
    const callId = part.callID ?? part.id;
    appendDetail(details, "Input", part.state.input, 300);

    if (status === "pending") {
      appendDetail(details, "Request", part.state.raw, 300);
    }

    if (status === "running") {
      appendDetail(details, "Action", part.state.title);
    }

    if (status === "completed") {
      appendDetail(details, "Result", part.state.title);
      appendDetail(details, "Output", part.state.output, 320);

      const attachmentCount = part.state.attachments?.length ?? 0;
      if (attachmentCount > 0) {
        details.push(`Attachments: ${attachmentCount}`);
      }
    }

    if (status === "error") {
      appendDetail(details, "Error", part.state.error, 320);
    }

    return {
      id: event.id,
      stateKey: `tool:${callId}`,
      icon: getToolActivityIcon(toolName),
      label: `${toolName}: ${status}`,
      details: details.length > 0 ? details : undefined,
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
    const formattedObject = formatObjectDetailValue(value as Record<string, unknown>, maxLength);
    if (!formattedObject) {
      return null;
    }

    return formattedObject;
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

  const preview = entries
    .slice(0, 5)
    .map(([key, entryValue]) => {
      const formattedValue = formatDetailValue(entryValue, 90);
      if (!formattedValue) {
        return null;
      }

      return `${toDisplayKey(key)}: ${formattedValue}`;
    })
    .filter((entry): entry is string => entry !== null);

  if (preview.length === 0) {
    return null;
  }

  const suffix = entries.length > 5 ? ", ..." : "";
  return truncateText(`${preview.join(", ")}${suffix}`, maxLength);
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

function toTimestampOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }

  if (typeof value === "string" && value.length > 0) {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }

  return null;
}

function getLatestUserMessageCreatedAt(
  messages: Array<{ role: string; created_at: unknown }>,
): number | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") {
      continue;
    }

    const createdAt = toTimestampOrNull(message.created_at);
    if (createdAt !== null) {
      return createdAt;
    }
  }

  return null;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

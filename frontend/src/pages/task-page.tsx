import { useEffect, useRef, useState } from "react";
import { useLiveQuery, eq } from "@tanstack/react-db";
import { useParams } from "@tanstack/react-router";
import { stream } from "@durable-streams/client";
import { Check, GitBranch, Loader2, Pencil, Send, X } from "lucide-react";
import {
  TaskStreamActivity,
  type TaskStreamActivityIcon,
  type TaskStreamActivityItem,
} from "@/components/task-stream-activity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createTaskRun, getTaskEventStreamUrl, type TaskStreamEvent } from "../lib/api";
import { projectsCollection, taskMessagesCollection, tasksCollection } from "../lib/collections";

export function TaskPage() {
  const { taskId } = useParams({ from: "/_layout/tasks/$taskId" });
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [runEvents, setRunEvents] = useState<TaskStreamEvent[]>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const [runSandboxId, setRunSandboxId] = useState<string | null>(null);
  const [runBranch, setRunBranch] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const activeRunIdRef = useRef<string | null>(null);

  const { data: tasks } = useLiveQuery((q) => q.from({ t: tasksCollection }));
  const { data: projects } = useLiveQuery((q) => q.from({ p: projectsCollection }));
  const task = tasks?.find((t) => t.id === taskId);
  const taskProject = task?.project_id
    ? projects.find((project) => project.id === task.project_id)
    : null;

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
  const fallbackRunItems =
    runEvents.length === 0
      ? buildRunFallbackActivityItems({
          runStatus,
          runError,
          runSandboxId,
        })
      : [];
  const timelineEntries = buildChronologicalTimeline({
    messages,
    activityItems: [...fallbackRunItems, ...streamActivityItems].slice(-14),
    streamAssistantPreview,
    persistedAssistantMessage,
  });
  const showEmptyState = timelineEntries.length === 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, runEvents]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [taskId]);

  useEffect(() => {
    setActiveRunId(null);
    setRunStatus(null);
    setRunEvents([]);
    setRunError(null);
    setRunSandboxId(null);
    setRunBranch(null);
    setEditingTitle(false);
    setTitleError(null);
  }, [taskId]);

  useEffect(() => {
    activeRunIdRef.current = activeRunId;
  }, [activeRunId]);

  useEffect(() => {
    if (!taskId) {
      return;
    }

    const abortController = new AbortController();
    const seenEventIds = new Set<string>();

    const applyEvent = (event: TaskStreamEvent) => {
      if (seenEventIds.has(event.id)) {
        return;
      }
      seenEventIds.add(event.id);

      const previousRunId = activeRunIdRef.current;
      const switchedRun = previousRunId !== event.runId;
      if (switchedRun) {
        activeRunIdRef.current = event.runId;
        setActiveRunId(event.runId);
        setRunSandboxId(null);
        setRunBranch(null);
        setRunError(null);
      }

      setRunEvents((prev) => [...prev, event]);

      if (event.kind === "status") {
        setRunStatus(event.payload);
        if (event.payload !== "failed") {
          setRunError(null);
        }
      } else if (event.kind === "sandbox") {
        setRunSandboxId(event.payload);
      } else if (event.kind === "branch") {
        setRunBranch(event.payload);
      } else if (event.kind === "error") {
        setRunStatus("failed");
        setRunError(event.payload);
      }
    };

    const streamUrl = getTaskEventStreamUrl(taskId);

    stream<TaskStreamEvent>({
      url: streamUrl,
      offset: "-1",
      live: "sse",
      json: true,
      signal: abortController.signal,
    }).then((res) => {
      res.subscribeJson(({ items }) => {
        for (const event of items) {
          applyEvent(event);
        }
      });
    });

    return () => {
      abortController.abort();
    };
  }, [taskId]);

  useEffect(() => {
    if (!editingTitle) {
      setTitleInput(task?.title ?? "");
    }
  }, [task?.title, editingTitle]);

  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [editingTitle]);

  async function handleSend() {
    const content = input.trim();
    if (!content || sending || !taskId) return;

    setSending(true);
    setInput("");
    setRunError(null);
    setRunStatus("queued");
    setRunSandboxId(null);
    setRunBranch(null);

    try {
      const userMessage = {
        id: crypto.randomUUID(),
        task_id: taskId,
        role: "user",
        content,
        created_at: BigInt(Date.now()),
      };
      const messageTx = taskMessagesCollection.insert(userMessage);
      await messageTx.isPersisted.promise;

      const run = await createTaskRun(taskId, userMessage.id);
      setActiveRunId(run.id);
      setRunStatus(run.status);
    } catch (error) {
      setRunStatus("failed");
      setRunError(error instanceof Error ? error.message : "Failed to run OpenCode");
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

  function handleTitleEditStart() {
    if (!task) {
      return;
    }

    setEditingTitle(true);
    setTitleInput(task.title);
    setTitleError(null);
  }

  function handleTitleEditCancel() {
    setEditingTitle(false);
    setTitleInput(task?.title ?? "");
    setTitleError(null);
  }

  async function handleTitleEditSave() {
    if (!task || !taskId || savingTitle) {
      return;
    }

    const nextTitle = titleInput.trim();
    if (nextTitle.length === 0) {
      setTitleError("Title cannot be empty");
      return;
    }

    if (nextTitle === task.title) {
      setEditingTitle(false);
      setTitleError(null);
      return;
    }

    setSavingTitle(true);
    setTitleError(null);

    try {
      const tx = tasksCollection.update(taskId, (draft) => {
        draft.title = nextTitle;
        draft.updated_at = BigInt(Date.now());
      });
      setEditingTitle(false);
      await tx.isPersisted.promise;
    } catch (error) {
      setTitleError(error instanceof Error ? error.message : "Failed to update task title");
    } finally {
      setSavingTitle(false);
    }
  }

  function handleTitleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleTitleEditSave();
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      handleTitleEditCancel();
    }
  }

  if (!taskId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Select a task to get started
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-4 py-3 md:px-6">
        {editingTitle ? (
          <div className="flex min-h-8 items-center gap-2">
            <Input
              ref={titleInputRef}
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onKeyDown={handleTitleInputKeyDown}
              className="h-8 w-full max-w-lg px-2 text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => void handleTitleEditSave()}
              disabled={savingTitle}
              className="text-muted-foreground"
              title="Save task name"
            >
              {savingTitle ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={handleTitleEditCancel}
              disabled={savingTitle}
              className="text-muted-foreground"
              title="Cancel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="min-w-0">
            <div className="flex min-h-8 min-w-0 items-center gap-2">
              <h2 className="m-0 truncate text-sm font-medium">{task?.title ?? "Task"}</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={handleTitleEditStart}
                className="text-muted-foreground"
                title="Edit task name"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
            {taskProject ? (
              <p className="truncate text-xs text-muted-foreground">{taskProject.name}</p>
            ) : null}
            {runBranch ? (
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                <GitBranch className="h-3 w-3 shrink-0" />
                {runBranch}
              </p>
            ) : null}
          </div>
        )}
        {titleError ? <p className="mt-1 text-xs text-destructive">{titleError}</p> : null}
      </div>

      <div className="flex-1 overflow-y-auto">
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
          <div className="mx-auto max-w-3xl space-y-4 px-4 py-4">
            {timelineEntries.map((entry) => {
              if (entry.type === "activity") {
                return <TaskStreamActivity key={entry.id} items={[entry.item]} />;
              }

              if (entry.type === "assistant-preview") {
                return (
                  <div key={entry.id} className="flex justify-start">
                    <div className="max-w-[80%] text-sm whitespace-pre-wrap text-foreground">
                      {entry.content}
                    </div>
                  </div>
                );
              }

              return (
                <div key={entry.id} className="flex justify-start">
                  <div
                    className={`max-w-[80%] text-sm whitespace-pre-wrap ${
                      entry.role === "user"
                        ? "rounded-lg bg-primary px-4 py-2.5 text-primary-foreground"
                        : "text-foreground"
                    }`}
                  >
                    {entry.content}
                  </div>
                </div>
              );
            })}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border p-4">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message..."
            rows={1}
            className="min-h-[42px] max-h-[200px] flex-1 resize-none rounded-lg px-4 py-2.5 text-base md:text-sm"
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
            disabled={!input.trim() || sending}
            className="h-auto shrink-0 rounded-lg p-2.5"
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

    if (event.kind === "opencode.message.updated") {
      const payload = parseRunEventPayload(event.payload);
      const properties = toRecord(payload?.properties);
      const info = toRecord(properties?.info);
      const messageId = toStringOrNull(info?.id);
      const role = toStringOrNull(info?.role);
      if (messageId && role) {
        messageRoleById.set(messageId, role);
      }
      continue;
    }

    if (event.kind === "opencode.message.part.updated") {
      const payload = parseRunEventPayload(event.payload);
      const properties = toRecord(payload?.properties);
      const part = toRecord(properties?.part);
      const partType = toStringOrNull(part?.type);
      if (partType !== "text") {
        continue;
      }

      const messageId = toStringOrNull(part?.messageID);
      const role = messageId ? messageRoleById.get(messageId) : null;
      if (role !== "assistant") {
        continue;
      }

      const text = toStringOrNull(part?.text);
      if (text) {
        latest = { content: text, createdAt: event.createdAt };
      }
    }
  }

  return latest;
}

function buildRunFallbackActivityItems(args: {
  runStatus: string | null;
  runError: string | null;
  runSandboxId: string | null;
}): ChronologicalActivityItem[] {
  const createdAt = Date.now();
  const items: ChronologicalActivityItem[] = [];

  if (args.runStatus === "queued" || args.runStatus === "running") {
    items.push({
      id: `run-status-${args.runStatus}`,
      stateKey: "run-status",
      icon: "status",
      label: args.runStatus === "queued" ? "Queued" : "Running",
      tone: "muted",
      spinning: true,
      createdAt,
    });
  } else if (args.runStatus === "failed") {
    items.push({
      id: "run-status-failed",
      stateKey: "run-status",
      icon: "error",
      label: "Run failed",
      tone: "error",
      createdAt,
    });
  }

  if (args.runSandboxId) {
    items.push({
      id: `run-sandbox-${args.runSandboxId}`,
      stateKey: "run-sandbox",
      icon: "terminal",
      label: `Sandbox: ${args.runSandboxId}`,
      tone: "muted",
      createdAt,
    });
  }

  if (args.runError) {
    items.push({
      id: `run-error-${args.runError}`,
      stateKey: "run-error",
      icon: "error",
      label: args.runError,
      tone: "error",
      createdAt,
    });
  }

  return items;
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

  sortable.sort((a, b) => {
    if (a.item.createdAt === b.item.createdAt) {
      return a.order - b.order;
    }
    return a.item.createdAt - b.item.createdAt;
  });

  return sortable.map((entry) => entry.item);
}

function toTaskStreamActivityItem(event: TaskStreamEvent): ChronologicalActivityItem | null {
  if (event.kind === "assistant") {
    return null;
  }

  if (event.kind === "status") {
    if (event.payload === "succeeded") {
      return {
        id: event.id,
        stateKey: `run-status:${event.runId}`,
        icon: "success",
        label: "Run completed",
        tone: "success",
        createdAt: event.createdAt,
      };
    }

    if (event.payload === "failed") {
      return {
        id: event.id,
        stateKey: `run-status:${event.runId}`,
        icon: "error",
        label: "Run failed",
        tone: "error",
        createdAt: event.createdAt,
      };
    }

    if (event.payload === "queued" || event.payload === "running") {
      return {
        id: event.id,
        stateKey: `run-status:${event.runId}`,
        icon: "status",
        label: event.payload === "queued" ? "Queued" : "Running",
        tone: "muted",
        spinning: true,
        createdAt: event.createdAt,
      };
    }

    return {
      id: event.id,
      stateKey: `run-status:${event.runId}`,
      icon: "status",
      label: `Status: ${event.payload}`,
      tone: "muted",
      spinning: true,
      createdAt: event.createdAt,
    };
  }

  if (event.kind === "sandbox") {
    return {
      id: event.id,
      stateKey: `run-sandbox:${event.runId}`,
      icon: "terminal",
      label: `Sandbox: ${event.payload}`,
      tone: "muted",
      createdAt: event.createdAt,
    };
  }

  if (event.kind === "error") {
    return {
      id: event.id,
      stateKey: `run-error:${event.runId}`,
      icon: "error",
      label: event.payload,
      tone: "error",
      createdAt: event.createdAt,
    };
  }

  if (!event.kind.startsWith("opencode.")) {
    return {
      id: event.id,
      stateKey: `event:${event.kind}`,
      icon: "tool",
      label: `${event.kind}: ${event.payload}`,
      tone: "muted",
      createdAt: event.createdAt,
    };
  }

  const payload = parseRunEventPayload(event.payload);
  if (!payload) {
    return null;
  }

  if (event.kind === "opencode.message.part.updated") {
    const properties = toRecord(payload.properties);
    const part = toRecord(properties?.part);
    const partType = toStringOrNull(part?.type);
    if (!part || !partType) {
      return null;
    }

    if (partType === "reasoning") {
      const partId = toStringOrNull(part.id) ?? toStringOrNull(part.messageID) ?? event.id;
      const time = toRecord(part.time);
      const isComplete = typeof time?.end === "number";
      return {
        id: event.id,
        stateKey: `reasoning:${partId}`,
        icon: "thinking",
        label: isComplete ? "Thought complete" : "Thinking",
        tone: "muted",
        spinning: !isComplete,
        createdAt: event.createdAt,
      };
    }

    if (partType === "step-start" || partType === "step-finish") {
      const stepKey = toStringOrNull(part.snapshot) ?? toStringOrNull(part.messageID) ?? event.id;
      return {
        id: event.id,
        stateKey: `step:${stepKey}`,
        icon: "thinking",
        label: partType === "step-finish" ? "Step complete" : "Working on next step",
        tone: "muted",
        createdAt: event.createdAt,
      };
    }

    if (partType === "tool") {
      const toolName = toStringOrNull(part.tool) ?? "tool";
      const state = toRecord(part.state);
      const status = toStringOrNull(state?.status) ?? "updated";
      const title = toStringOrNull(state?.title);
      const callId = toStringOrNull(part.callID) ?? toStringOrNull(part.id) ?? toolName;

      return {
        id: event.id,
        stateKey: `tool:${callId}`,
        icon: getToolActivityIcon(toolName),
        label: title ? `${toolName}: ${status} (${title})` : `${toolName}: ${status}`,
        tone: status === "error" ? "error" : status === "completed" ? "success" : "muted",
        spinning: status === "running",
        createdAt: event.createdAt,
      };
    }

    return null;
  }

  if (event.kind === "opencode.command.executed") {
    const properties = toRecord(payload.properties);
    const name = toStringOrNull(properties?.name) ?? "command";
    const args = toStringOrNull(properties?.arguments);
    return {
      id: event.id,
      stateKey: `command:${event.id}`,
      icon: "terminal",
      label: args ? `${name}: ${args}` : name,
      tone: "muted",
      createdAt: event.createdAt,
    };
  }

  if (event.kind === "opencode.session.status") {
    const properties = toRecord(payload.properties);
    const sessionId = toStringOrNull(properties?.sessionID) ?? "default";
    const status = toRecord(properties?.status);
    const statusType = toStringOrNull(status?.type) ?? "unknown";
    return {
      id: event.id,
      stateKey: `session:${sessionId}`,
      icon: statusType === "idle" ? "success" : "status",
      label: statusType === "idle" ? "Session idle" : `Session ${statusType}`,
      tone: "muted",
      spinning: statusType === "busy",
      createdAt: event.createdAt,
    };
  }

  if (event.kind === "opencode.session.error") {
    const properties = toRecord(payload.properties);
    const sessionId = toStringOrNull(properties?.sessionID) ?? "default";
    const error = toRecord(properties?.error);
    const data = toRecord(error?.data);
    const message = toStringOrNull(data?.message) ?? "Session error";
    return {
      id: event.id,
      stateKey: `session:${sessionId}`,
      icon: "error",
      label: message,
      tone: "error",
      createdAt: event.createdAt,
    };
  }

  if (
    event.kind === "opencode.permission.updated" ||
    event.kind === "opencode.permission.replied"
  ) {
    const properties = toRecord(payload.properties);
    const permissionId =
      toStringOrNull(properties?.id) ??
      toStringOrNull(properties?.requestID) ??
      toStringOrNull(properties?.title) ??
      "default";
    const response = toStringOrNull(properties?.response);
    const title = toStringOrNull(properties?.title);
    return {
      id: event.id,
      stateKey: `permission:${permissionId}`,
      icon: "permission",
      label: response ? `Permission: ${response}` : (title ?? "Permission requested"),
      tone: "muted",
      createdAt: event.createdAt,
    };
  }

  if (event.kind === "opencode.todo.updated") {
    const properties = toRecord(payload.properties);
    const todos = Array.isArray(properties?.todos) ? properties.todos.length : 0;
    return {
      id: event.id,
      stateKey: "todo-list",
      icon: "tool",
      label: `Todo list updated (${todos})`,
      tone: "muted",
      createdAt: event.createdAt,
    };
  }

  return null;
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

function parseRunEventPayload(payload: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(payload) as unknown;
    return toRecord(value);
  } catch {
    return null;
  }
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
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

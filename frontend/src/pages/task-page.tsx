import { useEffect, useRef, useState } from "react";
import { useLiveQuery, eq } from "@tanstack/react-db";
import { useParams } from "@tanstack/react-router";
import { Check, Loader2, Pencil, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createTaskRun,
  fetchTaskRuns,
  getTaskEventStreamUrl,
  type TaskStreamEvent,
} from "../lib/api";
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

  const hasRunFeedback = activeRunId !== null || runStatus !== null || runError !== null;
  const displayRunEvents = runEvents
    .map(formatRunEvent)
    .filter((entry): entry is string => entry !== null);

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
    setEditingTitle(false);
    setTitleError(null);
  }, [taskId]);

  console.log("runEvents", runEvents)
  useEffect(() => {
    activeRunIdRef.current = activeRunId;
  }, [activeRunId]);

  useEffect(() => {
    if (!taskId) {
      return;
    }

    let cancelled = false;

    const loadLatestRun = async () => {
      try {
        const runs = await fetchTaskRuns(taskId);
        if (cancelled) {
          return;
        }

        const latestRun = runs[0];
        if (!latestRun) {
          setActiveRunId(null);
          setRunStatus(null);
          setRunSandboxId(null);
          setRunError(null);
          setRunEvents([]);
          return;
        }

        setActiveRunId(latestRun.id);
        setRunStatus(latestRun.status);
        setRunSandboxId(latestRun.sandboxId);
        setRunError(latestRun.error ?? null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setRunError(error instanceof Error ? error.message : "Failed to load task runs");
      }
    };

    void loadLatestRun();

    return () => {
      cancelled = true;
    };
  }, [taskId]);

  useEffect(() => {
    if (!taskId) {
      return;
    }

    let cancelled = false;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let source: EventSource | null = null;
    let reconnectDelayMs = 500;
    const seenEventIds = new Set<string>();
    const offsetStorageKey = getTaskStreamOffsetStorageKey(taskId);

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
        setRunEvents([]);
        setRunSandboxId(null);
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
      } else if (event.kind === "error") {
        setRunStatus("failed");
        setRunError(event.payload);
      }
    };

    const open = (offset: string) => {
      const streamUrl = getTaskEventStreamUrl(taskId, offset);
      source = new EventSource(streamUrl, { withCredentials: true });

      source.addEventListener("data", (rawEvent) => {
        const events = parseTaskStreamDataEvent((rawEvent as MessageEvent).data);
        if (events.length === 0) {
          return;
        }

        reconnectDelayMs = 500;
        for (const event of events) {
          if (cancelled) {
            return;
          }
          applyEvent(event);
        }
      });

      source.addEventListener("control", (rawEvent) => {
        const control = parseTaskStreamControlEvent((rawEvent as MessageEvent).data);
        if (!control) {
          return;
        }

        if (typeof control.streamNextOffset === "string" && control.streamNextOffset.length > 0) {
          storeTaskStreamOffset(offsetStorageKey, control.streamNextOffset);
        }
      });

      source.addEventListener("error", () => {
        source?.close();
        if (cancelled) {
          return;
        }

        const nextOffset = readTaskStreamOffset(offsetStorageKey) ?? "-1";
        const delay = reconnectDelayMs;
        reconnectDelayMs = Math.min(reconnectDelayMs * 2, 8000);
        reconnectTimeout = setTimeout(() => {
          if (!cancelled) {
            open(nextOffset);
          }
        }, delay);
      });
    };

    open(readTaskStreamOffset(offsetStorageKey) ?? "-1");

    return () => {
      cancelled = true;
      source?.close();
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
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
    setRunEvents([]);
    setRunStatus("queued");
    setRunSandboxId(null);

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
          </div>
        )}
        {titleError ? <p className="mt-1 text-xs text-destructive">{titleError}</p> : null}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-muted-foreground">
            <p className="text-sm">No messages yet</p>
            <p className="text-xs">Send a message to start an OpenCode run.</p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4 px-4 py-4">
            {messages.map((msg) => (
              <div key={msg.id} className="flex justify-start">
                <div
                  className={`max-w-[80%] text-sm whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "rounded-lg bg-primary px-4 py-2.5 text-primary-foreground"
                      : "text-foreground"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {hasRunFeedback ? (
              <Card className="gap-0 border-border bg-muted/50 py-0">
                <CardContent className="space-y-1 px-3 py-2">
                  <p className="text-xs font-medium text-foreground">
                    OpenCode run: {runStatus ?? (runError ? "failed" : "queued")}
                  </p>
                  {activeRunId ? (
                    <p className="text-xs text-muted-foreground">run: {activeRunId}</p>
                  ) : null}
                  {runSandboxId ? (
                    <p className="text-xs text-muted-foreground">sandbox: {runSandboxId}</p>
                  ) : null}
                  {displayRunEvents.map((entry, index) => (
                    <p
                      key={`${activeRunId ?? "run"}-${index}-${entry}`}
                      className="text-xs whitespace-pre-wrap text-muted-foreground"
                    >
                      {entry}
                    </p>
                  ))}
                  {runError ? <p className="text-xs text-destructive">error: {runError}</p> : null}
                </CardContent>
              </Card>
            ) : null}

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

function getTaskStreamOffsetStorageKey(taskId: string): string {
  return `task-stream-offset:${taskId}`;
}

function readTaskStreamOffset(key: string): string | null {
  try {
    const value = localStorage.getItem(key);
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function storeTaskStreamOffset(key: string, offset: string): void {
  try {
    localStorage.setItem(key, offset);
  } catch {}
}

function parseTaskStreamDataEvent(raw: unknown): TaskStreamEvent[] {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map(toTaskStreamEvent)
        .filter((event): event is TaskStreamEvent => event !== null);
    }

    const single = toTaskStreamEvent(parsed);
    return single ? [single] : [];
  } catch {
    return [];
  }
}

function toTaskStreamEvent(value: unknown): TaskStreamEvent | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }

  const id = toStringOrNull(record.id);
  const taskId = toStringOrNull(record.taskId);
  const runId = toStringOrNull(record.runId);
  const kind = toStringOrNull(record.kind);
  const payload = toStringOrNull(record.payload);
  const createdAt = record.createdAt;
  if (
    !id ||
    !taskId ||
    !runId ||
    !kind ||
    payload === null ||
    typeof createdAt !== "number" ||
    !Number.isFinite(createdAt)
  ) {
    return null;
  }

  return {
    id,
    taskId,
    runId,
    kind,
    payload,
    createdAt,
  };
}

function parseTaskStreamControlEvent(
  raw: unknown,
): { streamNextOffset?: string; upToDate?: boolean; streamClosed?: boolean } | null {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }

  try {
    const record = toRecord(JSON.parse(raw));
    if (!record) {
      return null;
    }

    return {
      streamNextOffset: toStringOrNull(record.streamNextOffset) ?? undefined,
      upToDate: typeof record.upToDate === "boolean" ? record.upToDate : undefined,
      streamClosed: typeof record.streamClosed === "boolean" ? record.streamClosed : undefined,
    };
  } catch {
    return null;
  }
}

function formatRunEvent(event: TaskStreamEvent): string | null {
  if (!event.kind.startsWith("opencode.")) {
    return `${event.kind}: ${event.payload}`;
  }

  const payload = parseRunEventPayload(event.payload);
  if (!payload) {
    return event.kind;
  }

  if (event.kind === "opencode.message.part.updated") {
    const properties = toRecord(payload.properties);
    const part = toRecord(properties?.part);
    if (!part) {
      return "message part updated";
    }

    const partType = toStringOrNull(part.type);
    if (partType === "tool") {
      const toolName = toStringOrNull(part.tool) ?? "unknown";
      const state = toRecord(part.state);
      const status = toStringOrNull(state?.status) ?? "updated";
      const title = toStringOrNull(state?.title);
      return title ? `tool ${toolName}: ${status} (${title})` : `tool ${toolName}: ${status}`;
    }

    if (partType === "step-start") {
      return "assistant step started";
    }
    if (partType === "step-finish") {
      return "assistant step finished";
    }

    return null;
  }

  if (event.kind === "opencode.message.updated") {
    const properties = toRecord(payload.properties);
    const info = toRecord(properties?.info);
    const role = toStringOrNull(info?.role);
    const time = toRecord(info?.time);
    if (role === "assistant" && typeof time?.completed === "number") {
      return "assistant message completed";
    }
    return null;
  }

  if (event.kind === "opencode.session.status") {
    const properties = toRecord(payload.properties);
    const status = toRecord(properties?.status);
    const statusType = toStringOrNull(status?.type) ?? "unknown";
    return `session status: ${statusType}`;
  }

  if (event.kind === "opencode.session.idle") {
    return "session idle";
  }

  if (event.kind === "opencode.session.error") {
    const properties = toRecord(payload.properties);
    const error = toRecord(properties?.error);
    const data = toRecord(error?.data);
    const message = toStringOrNull(data?.message) ?? "unknown session error";
    return `session error: ${message}`;
  }

  if (event.kind === "opencode.command.executed") {
    const properties = toRecord(payload.properties);
    const name = toStringOrNull(properties?.name) ?? "unknown";
    const args = toStringOrNull(properties?.arguments);
    return args ? `command ${name}: ${args}` : `command ${name}`;
  }

  if (event.kind === "opencode.permission.updated") {
    const properties = toRecord(payload.properties);
    const title = toStringOrNull(properties?.title) ?? "permission request";
    return `permission: ${title}`;
  }

  if (event.kind === "opencode.permission.replied") {
    const properties = toRecord(payload.properties);
    const response = toStringOrNull(properties?.response) ?? "unknown";
    return `permission response: ${response}`;
  }

  if (event.kind === "opencode.todo.updated") {
    const properties = toRecord(payload.properties);
    const todos = Array.isArray(properties?.todos) ? properties.todos.length : 0;
    return `todo list updated (${todos})`;
  }

  return event.kind.replace("opencode.", "");
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

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { useParams } from "@tanstack/react-router";
import { Check, Loader2, Pencil, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createTaskMessage,
  createTaskRun,
  fetchTaskRun,
  fetchTaskRunEvents,
  updateTask,
  type TaskRunEvent,
} from "../lib/api";
import { getTaskMessagesCollection, tasksCollection } from "../lib/collections";

const RUN_TERMINAL_STATUSES = new Set(["succeeded", "failed"]);

export function TaskPage() {
  const { taskId } = useParams({ from: "/layout/tasks/$taskId" });
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [runEvents, setRunEvents] = useState<TaskRunEvent[]>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const [runSandboxId, setRunSandboxId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);

  const { data: tasks } = useLiveQuery((q) => q.from({ t: tasksCollection }));
  const task = tasks?.find((t) => t.id === taskId);

  const messagesCollection = taskId ? getTaskMessagesCollection(taskId) : null;
  const { data: messages, isLoading } = useLiveQuery(
    (q) => (messagesCollection ? q.from({ m: messagesCollection }) : null),
    [taskId],
  );
  const orderedMessages = messages
    ? [...messages].toSorted((a, b) => {
        const createdDiff = a.createdAt - b.createdAt;
        if (createdDiff !== 0) {
          return createdDiff;
        }

        if (a.role !== b.role) {
          return a.role === "user" ? -1 : 1;
        }

        return a.id.localeCompare(b.id);
      })
    : messages;
  const hasRunFeedback = activeRunId !== null || runStatus !== null || runError !== null;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
      const { data: userMessage, txid: messageTxid } = await createTaskMessage(
        taskId,
        "user",
        content,
      );
      if (messageTxid !== undefined) {
        await messagesCollection?.utils.awaitTxId(messageTxid);
      }

      const run = await createTaskRun(taskId, userMessage.id);
      setActiveRunId(run.id);
      setRunStatus(run.status);

      await monitorRun(run.id);
    } catch (error) {
      setRunStatus("failed");
      setRunError(error instanceof Error ? error.message : "Failed to run OpenCode");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function monitorRun(runId: string) {
    let after: number | undefined;

    while (mountedRef.current) {
      const [run, events] = await Promise.all([
        fetchTaskRun(runId),
        fetchTaskRunEvents(runId, after),
      ]);

      if (!mountedRef.current) {
        return;
      }

      if (events.length > 0) {
        setRunEvents((prev) => [...prev, ...events]);
        after = events[events.length - 1]?.createdAt;
      }

      if (run.sandboxId) {
        setRunSandboxId(run.sandboxId);
      }
      setRunStatus(run.status);

      if (RUN_TERMINAL_STATUSES.has(run.status)) {
        if (run.error) {
          setRunError(run.error);
        }
        return;
      }

      await sleep(1000);
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
      const { txid } = await updateTask(taskId, nextTitle);
      if (txid !== undefined) {
        await tasksCollection.utils.awaitTxId(txid);
      }
      setEditingTitle(false);
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
        )}
        {titleError ? <p className="mt-1 text-xs text-destructive">{titleError}</p> : null}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !orderedMessages || orderedMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-muted-foreground">
            <p className="text-sm">No messages yet</p>
            <p className="text-xs">Send a message to start an OpenCode run.</p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4 px-4 py-4">
            {orderedMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
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
                  {runEvents.slice(-4).map((event) => (
                    <p key={event.id} className="text-xs whitespace-pre-wrap text-muted-foreground">
                      {event.kind}: {event.payload}
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

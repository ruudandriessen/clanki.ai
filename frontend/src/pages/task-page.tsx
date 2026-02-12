import { useState, useRef, useEffect } from "react";
import { useParams } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { Loader2, Send } from "lucide-react";
import { getTaskMessagesCollection, tasksCollection, queryClient } from "../lib/collections";
import {
  createTaskMessage,
  createTaskRun,
  fetchTaskRun,
  fetchTaskRunEvents,
  type TaskRunEvent,
} from "../lib/api";

const RUN_TERMINAL_STATUSES = new Set(["succeeded", "failed"]);

export function TaskPage() {
  const { taskId } = useParams({ from: "/layout/tasks/$taskId" });
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [runEvents, setRunEvents] = useState<TaskRunEvent[]>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mountedRef = useRef(true);

  const { data: tasks } = useLiveQuery((q) => q.from({ t: tasksCollection }));
  const task = tasks?.find((t) => t.id === taskId);

  const messagesCollection = taskId ? getTaskMessagesCollection(taskId) : null;
  const { data: messages, isLoading } = useLiveQuery(
    (q) => (messagesCollection ? q.from({ m: messagesCollection }) : null),
    [taskId],
  );

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, runEvents]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, [taskId]);

  useEffect(() => {
    setActiveRunId(null);
    setRunStatus(null);
    setRunEvents([]);
    setRunError(null);
  }, [taskId]);

  async function handleSend() {
    const content = input.trim();
    if (!content || sending || !taskId) return;

    setSending(true);
    setInput("");
    setRunError(null);
    setRunEvents([]);
    setRunStatus("queued");

    try {
      const userMessage = await createTaskMessage(taskId, "user", content);
      queryClient.invalidateQueries({ queryKey: ["taskMessages", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });

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

      setRunStatus(run.status);

      if (RUN_TERMINAL_STATUSES.has(run.status)) {
        if (run.error) {
          setRunError(run.error);
        }
        queryClient.invalidateQueries({ queryKey: ["taskMessages", taskId] });
        queryClient.invalidateQueries({ queryKey: ["tasks"] });
        return;
      }

      await sleep(1000);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (!taskId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Select a task to get started
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 md:px-6 py-3 border-b border-border shrink-0">
        <h2 className="text-sm font-medium truncate">{task?.title ?? "Task"}</h2>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !messages || messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 px-4">
            <p className="text-sm">No messages yet</p>
            <p className="text-xs">Send a message to start an OpenCode run.</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
            {messages.map((msg) => (
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

            {activeRunId ? (
              <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 space-y-1">
                <p className="text-xs font-medium text-foreground">
                  OpenCode run: {runStatus ?? "queued"}
                </p>
                {runEvents.slice(-4).map((event) => (
                  <p key={event.id} className="text-xs text-muted-foreground whitespace-pre-wrap">
                    {event.kind}: {event.payload}
                  </p>
                ))}
                {runError ? <p className="text-xs text-red-500">error: {runError}</p> : null}
              </div>
            ) : null}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-border p-4 shrink-0">
        <div className="max-w-3xl mx-auto flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary min-h-[42px] max-h-[200px]"
            style={{ height: "auto" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 200) + "px";
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="shrink-0 p-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
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

import { useState, useRef, useEffect } from "react";
import { useParams } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { Loader2, Send } from "lucide-react";
import { getTaskMessagesCollection, tasksCollection, queryClient } from "../lib/collections";
import { createTaskMessage } from "../lib/api";

export function TaskPage() {
  const { taskId } = useParams({ strict: false }) as { taskId: string };
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: tasks } = useLiveQuery((q) => q.from({ t: tasksCollection }));
  const task = tasks?.find((t) => t.id === taskId);

  const messagesCollection = taskId ? getTaskMessagesCollection(taskId) : null;
  const { data: messages, isLoading } = useLiveQuery(
    (q) => (messagesCollection ? q.from({ m: messagesCollection }) : null),
    [taskId],
  );

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, [taskId]);

  async function handleSend() {
    const content = input.trim();
    if (!content || sending || !taskId) return;

    setSending(true);
    setInput("");
    try {
      await createTaskMessage(taskId, "user", content);
      queryClient.invalidateQueries({ queryKey: ["taskMessages", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } finally {
      setSending(false);
      inputRef.current?.focus();
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
            <p className="text-xs">
              Send a message to get started. Chat functionality is coming soon.
            </p>
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

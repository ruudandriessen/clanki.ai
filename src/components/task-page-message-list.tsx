import type { RefObject } from "react";
import { Loader2 } from "lucide-react";
import { TaskStreamActivity } from "@/components/task-stream-activity";
import { MarkdownContent } from "@/components/markdown-content";
import { AnimatedStreamItem } from "@/components/animated-stream-item";
import { CollapsedActivityGroup } from "@/components/collapsed-activity-group";
import { formatDuration } from "@/lib/format-duration";
import type { TimelineEntry } from "@/lib/task-timeline";

interface TaskPageMessageListProps {
  messageListRef: RefObject<HTMLDivElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  showEmptyState: boolean;
  preparingWorkspace: boolean;
  timelineEntries: TimelineEntry[];
  isRunning: boolean;
  runningDurationMs: number | null;
}

export function TaskPageMessageList({
  messageListRef,
  messagesEndRef,
  onScroll,
  showEmptyState,
  preparingWorkspace,
  timelineEntries,
  isRunning,
  runningDurationMs,
}: TaskPageMessageListProps) {
  return (
    <div
      ref={messageListRef}
      onScroll={onScroll}
      className="neo-scroll flex-1 overflow-y-auto bg-background"
    >
      {showEmptyState ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-muted-foreground">
          {preparingWorkspace ? (
            <>
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-muted/60">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Setting up worktree</p>
                <p className="text-xs">
                  You can draft your message while the runner prepares the workspace.
                </p>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm">No messages yet</p>
              <p className="text-xs">Send a message to start a task discussion.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4 px-4 py-4 md:px-6">
          {timelineEntries.map((entry) => {
            if (entry.type === "activity") {
              return <TaskStreamActivity key={entry.id} items={[entry.item]} />;
            }

            if (entry.type === "activity-group") {
              return (
                <AnimatedStreamItem key={entry.id}>
                  <CollapsedActivityGroup items={entry.items} />
                </AnimatedStreamItem>
              );
            }

            if (entry.type === "assistant-draft") {
              return (
                <AnimatedStreamItem key={entry.id}>
                  <div className="max-w-3xl rounded-[var(--radius-md)] border border-border/70 bg-card/80 p-4">
                    <MarkdownContent content={entry.content} className="text-foreground" />
                  </div>
                </AnimatedStreamItem>
              );
            }

            const isUserMessage = entry.role === "user";
            return (
              <AnimatedStreamItem key={entry.id}>
                <div className={isUserMessage ? "flex justify-end" : ""}>
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
              </AnimatedStreamItem>
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
  );
}

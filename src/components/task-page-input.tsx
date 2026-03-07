import type { KeyboardEvent, RefObject } from "react";
import { Loader2, Send } from "lucide-react";
import { TaskModelPicker } from "@/components/task-model-picker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { getRunnerModelOptions } from "@/lib/runner-models";

interface TaskPageInputProps {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  isRunning: boolean;
  isReadOnlyRemoteTask: boolean;
  sending: boolean;
  isRunnerBackedTask: boolean;
  desktopApp: boolean;
  activeModelSelection: { provider: string; model: string } | null;
  onModelChange: (selection: { provider: string; model: string } | null) => void;
  availableModelOptions: ReturnType<typeof getRunnerModelOptions>;
  isRunnerModelsLoading: boolean;
  runnerModelErrorMessage: string | null;
}

export function TaskPageInput({
  inputRef,
  input,
  onInputChange,
  onSend,
  isRunning,
  isReadOnlyRemoteTask,
  sending,
  isRunnerBackedTask,
  desktopApp,
  activeModelSelection,
  onModelChange,
  availableModelOptions,
  isRunnerModelsLoading,
  runnerModelErrorMessage,
}: TaskPageInputProps) {
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  return (
    <div className="shrink-0 bg-background p-4 pt-0">
      <div className="rounded-[var(--radius-md)] border border-border bg-muted/55 shadow-[3px_3px_0_0_var(--color-border)]">
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isReadOnlyRemoteTask
              ? "This runner-backed task is read-only on this device."
              : isRunning
                ? "Wait for the current run to finish..."
                : "Send a message..."
          }
          rows={4}
          disabled={isRunning || isReadOnlyRemoteTask || sending}
          className="min-h-[120px] max-h-[240px] resize-none rounded-none border-0 bg-transparent px-4 py-4 text-base leading-relaxed shadow-none focus-visible:ring-0 md:text-sm"
          style={{ height: "auto" }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = "auto";
            target.style.height = Math.min(target.scrollHeight, 240) + "px";
          }}
        />
        <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-0 pb-4">
          {isRunnerBackedTask && desktopApp ? (
            <TaskModelPicker
              value={activeModelSelection}
              onChange={onModelChange}
              options={availableModelOptions}
              isLoading={isRunnerModelsLoading}
              error={
                runnerModelErrorMessage ??
                (!isRunnerModelsLoading && availableModelOptions.length === 0
                  ? "No connected OpenCode providers were found in the runner."
                  : null)
              }
              disabled={isReadOnlyRemoteTask || sending || isRunning}
            />
          ) : null}
          <Button
            type="button"
            onClick={onSend}
            disabled={!input.trim() || isReadOnlyRemoteTask || sending || isRunning}
            className={cn(
              "h-[42px] w-[42px] shrink-0 rounded-[var(--radius-md)] p-0",
              !(isRunnerBackedTask && desktopApp) && "ml-auto",
            )}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

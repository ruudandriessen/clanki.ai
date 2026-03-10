import { useEffect, useRef, useState } from "react";
import { useLiveQuery, eq } from "@tanstack/react-db";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import { TaskPageHeader } from "@/components/task-page-header";
import { TaskPageMessageList } from "@/components/task-page-message-list";
import { TaskPageInput } from "@/components/task-page-input";
import { promptDesktopRunnerTask } from "@/lib/desktop-runner";
import { failTaskRun } from "@/lib/fail-task-run";
import { isDesktopApp } from "@/lib/is-desktop-app";
import {
  localStorageKeys,
  sessionStateKeys,
  useLocalStorageState,
  useSessionState,
} from "@/lib/session-state";
import {
  getDefaultRunnerModelSelection,
  getRunnerModelOptions,
  isRunnerModelSelectionAvailable,
  useRunnerModels,
} from "@/lib/runner-models";
import {
  buildChronologicalTimeline,
  buildTaskStreamActivityItems,
  getLatestAssistantMessage,
  getLatestStreamAssistantPreview,
  getLatestUserMessageCreatedAt,
} from "@/lib/task-timeline";
import { startTaskRun } from "@/server/functions/task-runs";
import { taskMessagesCollection, tasksCollection } from "../lib/collections";
import { useTaskEventStream } from "../lib/use-task-event-stream";

const CREATE_PR_MESSAGE = "Create a PR for me";

export interface TaskPageProps {
  taskId: string;
  projectName: string;
  streamId: string | null;
  branchName: string | null;
  pullRequest: {
    prNumber: number;
    url: string;
    status: "open" | "merged" | "closed" | "draft";
    reviewState: string | null;
    checksCount: number | null;
    checksCompletedCount: number | null;
    checksState: string | null;
    checksConclusion: string | null;
  } | null;
  title: string;
  error: string | null;
  isRunning: boolean;
  runnerSessionId: string | null;
  runnerType: string | null;
  workspacePath: string | null;
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
  runnerSessionId,
  runnerType,
  workspacePath,
}: TaskPageProps) {
  const displayTitle = branchName ?? title;
  const [input, setInput] = useSessionState(sessionStateKeys.taskInput(taskId), "");
  const [selectedModel, setSelectedModel] = useSessionState(
    sessionStateKeys.taskModel(taskId),
    null,
  );
  const [lastUsedModel, setLastUsedModel] = useLocalStorageState(
    localStorageKeys.lastUsedTaskModel(),
    null,
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const runEvents = useTaskEventStream({ taskId, streamId });
  const [now, setNow] = useState(() => Date.now());
  const messageListRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const shouldStickToBottomRef = useRef(true);

  const { data: messages } = useLiveQuery(
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
  const desktopApp = isDesktopApp();
  const isRunnerBackedTask =
    runnerType === "local-worktree" && !!runnerSessionId && !!workspacePath;
  const willBeRunnerBacked = desktopApp && (!runnerType || isRunnerBackedTask);
  const isReadOnlyRemoteTask = isRunnerBackedTask && !desktopApp;
  const {
    data: runnerModels,
    error: runnerModelsError,
    isLoading: isRunnerModelsLoading,
  } = useRunnerModels(isRunnerBackedTask ? workspacePath : null);
  const availableModelOptions = getRunnerModelOptions(runnerModels);
  const defaultModelSelection = getDefaultRunnerModelSelection(runnerModels);
  const activeModelSelection = isRunnerModelSelectionAvailable(selectedModel, availableModelOptions)
    ? selectedModel
    : isRunnerModelSelectionAvailable(lastUsedModel, availableModelOptions)
      ? lastUsedModel
      : availableModelOptions.length > 0
        ? defaultModelSelection
        : (selectedModel ?? lastUsedModel ?? defaultModelSelection);
  const runnerModelErrorMessage =
    runnerModelsError instanceof Error ? runnerModelsError.message : null;

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
    if (messages.length > 0) {
      return;
    }

    inputRef.current?.focus();
  }, [taskId, messages.length]);

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

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
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

      if (isRunnerBackedTask && runnerSessionId && workspacePath) {
        const taskRun = await startTaskRun({
          data: {
            taskId,
          },
        });

        try {
          await promptDesktopRunnerTask({
            backendBaseUrl: globalThis.location.origin,
            callbackToken: taskRun.callbackToken,
            directory: workspacePath,
            executionId: taskRun.executionId,
            model: activeModelSelection?.model,
            prompt: content,
            provider: activeModelSelection?.provider,
            sessionId: runnerSessionId,
          });
        } catch (promptError) {
          await failTaskRun({
            backendBaseUrl: globalThis.location.origin,
            callbackToken: taskRun.callbackToken,
            errorMessage:
              promptError instanceof Error
                ? promptError.message
                : "Failed to send message to runner",
            executionId: taskRun.executionId,
          }).catch(() => undefined);

          throw promptError;
        }
      }
    },
    onSettled: () => {
      inputRef.current?.focus();
    },
  });

  const sending = sendMutation.isPending;
  const sendError = sendMutation.error;
  const displayError =
    localError ?? (sendError instanceof Error ? sendError.message : null) ?? error;

  function handleSend(contentOverride?: string) {
    const content = (contentOverride ?? input).trim();
    if (!content || sending || isRunning || !taskId) return;
    if (isReadOnlyRemoteTask) {
      setLocalError("This task is attached to a local runner session and is read-only here.");
      return;
    }

    shouldStickToBottomRef.current = true;
    setLocalError(null);
    sendMutation.reset();
    setSelectedModel(activeModelSelection);
    setLastUsedModel(activeModelSelection);
    if (contentOverride === undefined) {
      setInput("");
    }

    sendMutation.mutate(content);
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
        <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading task" />
      </div>
    );
  }

  return (
    <div className="neo-enter flex h-full flex-col bg-background">
      <TaskPageHeader
        displayTitle={displayTitle}
        projectName={projectName}
        branchName={branchName}
        pullRequest={pullRequest}
        desktopApp={desktopApp}
        isRunnerBackedTask={isRunnerBackedTask}
        workspacePath={workspacePath}
        sending={sending}
        isRunning={isRunning}
        onError={setLocalError}
        onCreatePr={() => handleSend(CREATE_PR_MESSAGE)}
      />

      {displayError ? (
        <div className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-4 py-2.5 md:px-6">
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-words">{displayError}</span>
          </div>
        </div>
      ) : null}

      <TaskPageMessageList
        messageListRef={messageListRef}
        messagesEndRef={messagesEndRef}
        onScroll={handleMessageListScroll}
        showEmptyState={showEmptyState}
        timelineEntries={timelineEntries}
        isRunning={isRunning}
        runningDurationMs={runningDurationMs}
      />

      <TaskPageInput
        inputRef={inputRef}
        input={input}
        onInputChange={setInput}
        onSend={() => handleSend()}
        isRunning={isRunning}
        isReadOnlyRemoteTask={isReadOnlyRemoteTask}
        sending={sending}
        preparingWorkspace={willBeRunnerBacked && !isRunnerBackedTask}
        isRunnerBackedTask={isRunnerBackedTask}
        willBeRunnerBacked={willBeRunnerBacked}
        activeModelSelection={activeModelSelection}
        onModelChange={(nextSelection) => {
          setSelectedModel(nextSelection);
          setLastUsedModel(nextSelection);
        }}
        availableModelOptions={availableModelOptions}
        isRunnerModelsLoading={isRunnerModelsLoading || !isRunnerBackedTask}
        runnerModelErrorMessage={runnerModelErrorMessage}
      />
    </div>
  );
}

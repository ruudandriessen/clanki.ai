import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { AlertCircle, Loader2 } from "lucide-react";
import { TaskPageArchitectureView } from "@/components/task-page-architecture-view";
import { TaskPageHeader } from "@/components/task-page-header";
import { TaskPageMessageList } from "@/components/task-page-message-list";
import { TaskPageInput } from "@/components/task-page-input";
import { buildChatTimeline, getLatestUserMessageCreatedAt } from "@/lib/chat-timeline";
import { isDesktopApp } from "@/lib/is-desktop-app";
import {
  localStorageKeys,
  sessionStateKeys,
  useLocalStorageState,
  useSessionState,
} from "@/lib/session-state";
import { useRunnerArchitectureDiff } from "@/lib/runner-architecture-diff";
import {
  getDefaultRunnerModelSelection,
  getRunnerModelOptions,
  isRunnerModelSelectionAvailable,
  useRunnerModels,
} from "@/lib/runner-models";
import { TASKS_QUERY_KEY } from "@/lib/use-tasks";

const CREATE_PR_MESSAGE = "Create a PR for me";

export interface TaskPageProps {
  taskId: string;
  projectName: string;
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
  pullRequest,
  error,
  isRunning,
  runnerType,
  workspacePath,
}: TaskPageProps) {
  const displayTitle = branchName ?? title;
  const [input, setInput] = useSessionState(sessionStateKeys.taskInput(taskId), "");
  const [selectedModel, setSelectedModel] = useSessionState(
    sessionStateKeys.taskModel(taskId),
    null,
  );
  const [viewMode, setViewMode] = useSessionState(sessionStateKeys.taskView(taskId), "chat");
  const [lastUsedModel, setLastUsedModel] = useLocalStorageState(
    localStorageKeys.lastUsedTaskModel(),
    null,
  );
  const queryClient = useQueryClient();
  const [localError, setLocalError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const messageListRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const shouldStickToBottomRef = useRef(true);

  const desktopApp = isDesktopApp();
  const isRunnerBackedTask = runnerType === "local-worktree" && !!workspacePath;
  const willBeRunnerBacked = desktopApp && (!runnerType || isRunnerBackedTask);
  const preparingWorkspace = willBeRunnerBacked && !isRunnerBackedTask;
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
  const showArchitectureModeToggle = willBeRunnerBacked;
  const {
    data: architectureDiff,
    error: runnerArchitectureDiffError,
    isLoading: isArchitectureDiffLoading,
  } = useRunnerArchitectureDiff({
    directory: isRunnerBackedTask ? workspacePath : null,
    enabled: viewMode === "architecture",
    refetchIntervalMs: isRunning ? 3_000 : undefined,
  });
  const runnerArchitectureDiffErrorMessage =
    runnerArchitectureDiffError instanceof Error ? runnerArchitectureDiffError.message : null;

  const {
    messages,
    sendMessage,
    isLoading: isChatLoading,
    error: chatError,
  } = useChat({
    connection: fetchServerSentEvents(`/api/tasks/${taskId}/chat`),
    threadId: taskId,
    persistence: true,
    forwardedProps: {
      model: activeModelSelection?.model,
      provider: activeModelSelection?.provider,
    },
    onFinish: () => {
      void queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
    },
    onError: (sendError) => {
      setLocalError(sendError.message);
    },
  });

  const timelineEntries = buildChatTimeline({
    messages,
    isLoading: isChatLoading,
  });
  const showEmptyState = timelineEntries.length === 0;
  const runStartedAt = getLatestUserMessageCreatedAt(messages);
  const isBusy = isChatLoading || isRunning;
  const runningDurationMs =
    isBusy && runStartedAt !== null ? Math.max(0, now - runStartedAt) : null;
  const displayError = localError ?? chatError?.message ?? error;

  useEffect(() => {
    if (!shouldStickToBottomRef.current) {
      return;
    }

    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isChatLoading]);

  useEffect(() => {
    shouldStickToBottomRef.current = true;
  }, [taskId]);

  useEffect(() => {
    if (!showArchitectureModeToggle && viewMode !== "chat") {
      setViewMode("chat");
    }
  }, [setViewMode, showArchitectureModeToggle, viewMode]);

  useEffect(() => {
    if (messages.length > 0) {
      return;
    }

    inputRef.current?.focus();
  }, [taskId, messages.length]);

  useEffect(() => {
    if (!isBusy) {
      return;
    }

    const timerId = globalThis.setInterval(() => {
      setNow(Date.now());
    }, 1_000);

    return () => {
      globalThis.clearInterval(timerId);
    };
  }, [isBusy]);

  async function handleSend(contentOverride?: string) {
    const content = (contentOverride ?? input).trim();
    if (!content || isBusy || !taskId) return;
    if (isReadOnlyRemoteTask) {
      setLocalError("This task is attached to a local runner session and is read-only here.");
      return;
    }
    if (!isRunnerBackedTask) {
      setLocalError("Wait for the workspace to finish setting up before sending a message.");
      return;
    }

    shouldStickToBottomRef.current = true;
    setLocalError(null);
    setSelectedModel(activeModelSelection);
    setLastUsedModel(activeModelSelection);
    if (contentOverride === undefined) {
      setInput("");
    }

    try {
      await sendMessage(content);
      await queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
    } catch (sendError) {
      setLocalError(sendError instanceof Error ? sendError.message : "Failed to send message");
    } finally {
      inputRef.current?.focus();
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
        showArchitectureModeToggle={showArchitectureModeToggle}
        onViewModeChange={setViewMode}
        viewMode={viewMode}
        workspacePath={workspacePath}
        sending={isChatLoading}
        isRunning={isBusy}
        onError={setLocalError}
        onCreatePr={() => void handleSend(CREATE_PR_MESSAGE)}
      />

      {displayError ? (
        <div className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-4 py-2.5 md:px-6">
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-words">{displayError}</span>
          </div>
        </div>
      ) : null}

      {viewMode === "architecture" ? (
        <TaskPageArchitectureView
          diff={architectureDiff}
          diffErrorMessage={runnerArchitectureDiffErrorMessage}
          isDiffLoading={isArchitectureDiffLoading}
          isRunnerBackedTask={isRunnerBackedTask}
          preparingWorkspace={preparingWorkspace}
        />
      ) : (
        <TaskPageMessageList
          messageListRef={messageListRef}
          messagesEndRef={messagesEndRef}
          onScroll={handleMessageListScroll}
          showEmptyState={showEmptyState}
          preparingWorkspace={preparingWorkspace}
          timelineEntries={timelineEntries}
          isRunning={isBusy}
          runningDurationMs={runningDurationMs}
        />
      )}

      <TaskPageInput
        inputRef={inputRef}
        input={input}
        onInputChange={setInput}
        onSend={() => void handleSend()}
        isRunning={isBusy}
        isReadOnlyRemoteTask={isReadOnlyRemoteTask}
        sending={isChatLoading}
        preparingWorkspace={preparingWorkspace}
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

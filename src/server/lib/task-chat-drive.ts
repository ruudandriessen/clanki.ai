import { chat, type StreamChunk } from "@tanstack/ai";
import { withLocks } from "@tanstack/ai/locks";
import type { StreamDurability } from "@tanstack/ai";
import { withPersistence } from "@tanstack/ai-persistence";
import { sandboxRunDriver, withSandbox } from "@tanstack/ai-sandbox";
import { getDb } from "@/server/db/client";
import { taskChatPersistence } from "@/server/lib/ai-persistence";
import { toOpencodeModelRef } from "@/server/lib/opencode";
import { omitReplayedUserText } from "@/server/lib/omit-replayed-user-text";
import { readOpencodeSessionId } from "@/server/lib/opencode-session-id";
import { readWorkspaceBranch } from "@/server/lib/read-workspace-branch";
import { readTaskChatModel } from "@/server/lib/task-chat-model";
import { taskChatDurability } from "@/server/lib/task-chat-durability";
import { taskChatLocks } from "@/server/lib/task-chat-locks";
import { syncTaskAfterChat } from "@/server/lib/task-execution/helpers";
import {
  createTaskChatAdapter,
  createTaskSandbox,
  opencodePortForTask,
} from "@/server/lib/task-harness";
import { readThreadMetadata } from "@/server/lib/thread-metadata";

function controllerFor(signal: AbortSignal): AbortController {
  const controller = new AbortController();
  const abort = (): void => controller.abort(signal.reason);
  if (signal.aborted) {
    abort();
  } else {
    signal.addEventListener("abort", abort, { once: true });
  }
  return controller;
}

export function durabilityForRunId(runId: string) {
  const url = new URL("https://reaper.internal/");
  url.searchParams.set("runId", runId);
  return taskChatDurability(new Request(url));
}

export async function* driveTaskChatRun(input: {
  runId: string;
  threadId: string;
  signal: AbortSignal;
  workspacePath: string;
  durability: StreamDurability;
  attach?: boolean;
  forwardedProps?: Record<string, unknown>;
}): AsyncGenerator<StreamChunk> {
  const db = await getDb();
  const threadMetadata = await readThreadMetadata(db, input.threadId);
  const { model, provider } = readTaskChatModel(input.forwardedProps ?? {});
  const storedMessages = input.attach
    ? await taskChatPersistence.stores.messages.loadThread(input.threadId)
    : [];

  const stream = chat({
    adapter: createTaskChatAdapter({
      harness: "opencode",
      modelRef: toOpencodeModelRef(provider, model),
      port: opencodePortForTask(input.threadId),
    }),
    messages: storedMessages,
    threadId: input.threadId,
    runId: input.runId,
    abortController: controllerFor(input.signal),
    modelOptions: threadMetadata.runnerSessionId
      ? { sessionId: threadMetadata.runnerSessionId }
      : {},
    middleware: [
      withPersistence(taskChatPersistence, { snapshotStreaming: true }),
      withLocks(taskChatLocks),
      ...(input.attach ? [] : [omitReplayedUserText()]),
      withSandbox(
        createTaskSandbox({ taskId: input.threadId, workspacePath: input.workspacePath }),
        {
          runs: taskChatPersistence.stores.runs,
          durability: {
            adapter: input.durability,
            attach: input.attach ?? false,
          },
        },
      ),
    ],
  });

  yield* withTaskChatCompletionSync(stream, {
    taskId: input.threadId,
    workspacePath: input.workspacePath,
    runnerSessionId: threadMetadata.runnerSessionId,
  });
}

export function createTaskChatTakeoverDriver(args: {
  request: Request;
  taskId: string;
  workspacePath: string;
}) {
  return sandboxRunDriver({
    request: args.request,
    runs: taskChatPersistence.stores.runs,
    locks: taskChatLocks,
    durability: (runId) => durabilityForRunId(runId),
    drive: ({ runId, threadId, signal }) =>
      driveTaskChatRun({
        runId,
        threadId,
        signal,
        workspacePath: args.workspacePath,
        durability: durabilityForRunId(runId),
        attach: true,
      }),
  });
}

export async function* withTaskChatCompletionSync(
  stream: AsyncIterable<StreamChunk>,
  args: {
    taskId: string;
    workspacePath: string;
    runnerSessionId: string | null;
  },
): AsyncGenerator<StreamChunk> {
  let runnerSessionId = args.runnerSessionId;
  let errorMessage: string | null = null;
  let streamCompleted = false;

  try {
    for await (const chunk of stream) {
      const sessionId = readOpencodeSessionId(chunk);
      if (sessionId) {
        runnerSessionId = sessionId;
      }

      if (chunk.type === "RUN_ERROR") {
        errorMessage = chunk.message;
      }

      yield chunk;
    }
    streamCompleted = true;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Task run failed";
    throw error;
  } finally {
    if (streamCompleted && !errorMessage) {
      const db = await getDb();
      const branch = readWorkspaceBranch(args.workspacePath);
      await syncTaskAfterChat({
        db,
        taskId: args.taskId,
        ...(runnerSessionId ? { runnerSessionId } : {}),
        ...(branch ? { branch } : {}),
      });
    }
  }
}

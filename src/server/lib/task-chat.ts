import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
  type StreamChunk,
} from "@tanstack/ai";
import { InMemoryLockStore, withLocks } from "@tanstack/ai/locks";
import type { StreamDurability } from "@tanstack/ai";
import { withPersistence } from "@tanstack/ai-persistence";
import { sandboxRunDriver, withSandbox } from "@tanstack/ai-sandbox";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { taskChatPersistence } from "@/server/lib/ai-persistence";
import { toOpencodeModelRef } from "@/server/lib/opencode";
import { omitReplayedUserText } from "@/server/lib/omit-replayed-user-text";
import { readOpencodeSessionId } from "@/server/lib/opencode-session-id";
import { readWorkspaceBranch } from "@/server/lib/read-workspace-branch";
import { readTaskChatModel } from "@/server/lib/task-chat-model";
import { taskChatDurability } from "@/server/lib/task-chat-durability";
import { syncTaskAfterChat } from "@/server/lib/task-execution/helpers";
import {
  createTaskChatAdapter,
  createTaskSandbox,
  opencodePortForTask,
} from "@/server/lib/task-harness";
import { readThreadMetadata } from "@/server/lib/thread-metadata";

export const taskChatLocks = new InMemoryLockStore();

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

export function shouldResumeTaskChat(request: Request): boolean {
  const durability = taskChatDurability(request);
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId");
  const offset = url.searchParams.get("offset");
  return durability.resumeFrom() !== null || (runId !== null && offset !== null);
}

export async function readTaskWorkspacePath(taskId: string): Promise<string | null> {
  const db = await getDb();
  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, taskId),
    columns: { workspacePath: true },
  });
  const workspacePath = task?.workspacePath?.trim() ?? "";
  return workspacePath.length > 0 ? workspacePath : null;
}

type TaskChatRequestParams = Awaited<ReturnType<typeof chatParamsFromRequest>>;

async function* createTaskChatStream(input: {
  runId: string;
  threadId: string;
  workspacePath: string;
  durability: StreamDurability;
  messages: TaskChatRequestParams["messages"];
  resume?: TaskChatRequestParams["resume"];
  attach?: boolean;
  forwardedProps?: TaskChatRequestParams["forwardedProps"];
  signal?: AbortSignal;
}): AsyncGenerator<StreamChunk> {
  const db = await getDb();
  const threadMetadata = await readThreadMetadata(db, input.threadId);
  const { model, provider } = readTaskChatModel(input.forwardedProps ?? {});

  const stream = chat({
    adapter: createTaskChatAdapter({
      harness: "opencode",
      modelRef: toOpencodeModelRef(provider, model),
      port: opencodePortForTask(input.threadId),
    }),
    messages: input.messages,
    threadId: input.threadId,
    runId: input.runId,
    ...(input.resume === undefined ? {} : { resume: input.resume }),
    ...(input.signal ? { abortController: controllerFor(input.signal) } : {}),
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

export async function* driveTaskChatRun(input: {
  runId: string;
  threadId: string;
  signal: AbortSignal;
  workspacePath: string;
  durability: StreamDurability;
}): AsyncGenerator<StreamChunk> {
  const messages = await taskChatPersistence.stores.messages.loadThread(input.threadId);
  yield* createTaskChatStream({
    ...input,
    messages,
    attach: true,
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
      }),
  });
}

export async function runTaskChat(args: { request: Request; taskId: string }): Promise<Response> {
  const db = await getDb();
  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, args.taskId),
  });

  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  const workspacePath = task.workspacePath?.trim() ?? "";
  if (workspacePath.length === 0) {
    return Response.json({ error: "Task workspace is not ready" }, { status: 409 });
  }

  const params = await chatParamsFromRequest(args.request);
  const durability = taskChatDurability(args.request);

  if (durability.resumeFrom() === null) {
    await taskChatPersistence.stores.runs.createOrResume({
      runId: params.runId,
      threadId: args.taskId,
      startedAt: Date.now(),
    });
  }

  const stream = createTaskChatStream({
    runId: params.runId,
    threadId: args.taskId,
    workspacePath,
    durability,
    messages: params.messages,
    resume: params.resume,
    forwardedProps: params.forwardedProps,
  });

  return toServerSentEventsResponse(stream, {
    durability: { adapter: durability },
  });
}

async function* withTaskChatCompletionSync(
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

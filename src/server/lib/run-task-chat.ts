import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
  type StreamChunk,
} from "@tanstack/ai";
import { withPersistence } from "@tanstack/ai-persistence";
import { withSandbox } from "@tanstack/ai-sandbox";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { loadTaskThreadMessages, taskChatPersistence } from "@/server/lib/ai-persistence";
import { firstTaskSystemPrompts } from "@/server/lib/first-task-prompt";
import { toOpencodeModelRef } from "@/server/lib/opencode";
import { readOpencodeSessionId } from "@/server/lib/opencode-session-id";
import { readWorkspaceBranch } from "@/server/lib/read-workspace-branch";
import { readTaskChatModel } from "@/server/lib/task-chat-model";
import { completeTask, markTaskFailed, markTaskRunning } from "@/server/lib/task-execution/helpers";
import {
  createTaskChatAdapter,
  createTaskSandbox,
  opencodePortForTask,
} from "@/server/lib/task-harness";

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
  const storedMessages = await loadTaskThreadMessages(args.taskId);
  const { model, provider } = readTaskChatModel(params.forwardedProps);
  const abortController = new AbortController();
  args.request.signal.addEventListener("abort", () => abortController.abort(), { once: true });

  await markTaskRunning({ db, taskId: args.taskId });

  const stream = chat({
    adapter: createTaskChatAdapter({
      harness: "opencode",
      modelRef: toOpencodeModelRef(provider, model),
      port: opencodePortForTask(args.taskId),
    }),
    messages: params.messages,
    threadId: args.taskId,
    runId: params.runId,
    resume: params.resume,
    abortController,
    systemPrompts: firstTaskSystemPrompts(storedMessages.length === 0),
    modelOptions: task.runnerSessionId ? { sessionId: task.runnerSessionId } : {},
    middleware: [
      withPersistence(taskChatPersistence, { snapshotStreaming: true }),
      withSandbox(createTaskSandbox({ taskId: args.taskId, workspacePath })),
    ],
  });

  return toServerSentEventsResponse(
    finalizeTaskChatStream(stream, {
      taskId: args.taskId,
      workspacePath,
      runnerSessionId: task.runnerSessionId,
    }),
    { abortController },
  );
}

async function* finalizeTaskChatStream(
  stream: AsyncIterable<StreamChunk>,
  args: {
    taskId: string;
    workspacePath: string;
    runnerSessionId: string | null;
  },
): AsyncGenerator<StreamChunk> {
  let runnerSessionId = args.runnerSessionId;
  let errorMessage: string | null = null;

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
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Task run failed";
    throw error;
  } finally {
    const db = await getDb();
    if (errorMessage) {
      await markTaskFailed({ db, taskId: args.taskId, message: errorMessage });
    } else {
      const branch = readWorkspaceBranch(args.workspacePath);
      await completeTask({
        db,
        taskId: args.taskId,
        ...(runnerSessionId ? { runnerSessionId } : {}),
        ...(branch ? { branch } : {}),
      });
    }
  }
}

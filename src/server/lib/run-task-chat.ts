import { chat, chatParamsFromRequest, toServerSentEventsResponse } from "@tanstack/ai";
import { withLocks } from "@tanstack/ai/locks";
import { withPersistence } from "@tanstack/ai-persistence";
import { withSandbox } from "@tanstack/ai-sandbox";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { taskChatPersistence } from "@/server/lib/ai-persistence";
import { toOpencodeModelRef } from "@/server/lib/opencode";
import { omitReplayedUserText } from "@/server/lib/omit-replayed-user-text";
import { readTaskChatModel } from "@/server/lib/task-chat-model";
import { taskChatDurability } from "@/server/lib/task-chat-durability";
import { taskChatLocks } from "@/server/lib/task-chat-locks";
import { withTaskChatCompletionSync } from "@/server/lib/task-chat-drive";
import { readThreadMetadata } from "@/server/lib/thread-metadata";
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
  const { model, provider } = readTaskChatModel(params.forwardedProps);
  const threadMetadata = await readThreadMetadata(db, args.taskId);
  const durability = taskChatDurability(args.request);
  const isFreshRun = durability.resumeFrom() === null;

  if (isFreshRun) {
    await taskChatPersistence.stores.runs.createOrResume({
      runId: params.runId,
      threadId: args.taskId,
      startedAt: Date.now(),
    });
  }

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
    modelOptions: threadMetadata.runnerSessionId
      ? { sessionId: threadMetadata.runnerSessionId }
      : {},
    middleware: [
      withPersistence(taskChatPersistence, { snapshotStreaming: true }),
      withLocks(taskChatLocks),
      omitReplayedUserText(),
      withSandbox(createTaskSandbox({ taskId: args.taskId, workspacePath }), {
        runs: taskChatPersistence.stores.runs,
        durability: { adapter: durability },
      }),
    ],
  });

  return toServerSentEventsResponse(
    withTaskChatCompletionSync(stream, {
      taskId: args.taskId,
      workspacePath,
      runnerSessionId: threadMetadata.runnerSessionId,
    }),
    {
      durability: { adapter: durability },
    },
  );
}

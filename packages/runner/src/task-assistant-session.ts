import type { Event as OpenCodeEvent, OpencodeClient, TextPart } from "@opencode-ai/sdk";
import { createLocalRunnerOpencodeClient } from "./opencode-client";
import { promptAssistantSession } from "./assistant-session";

const DEFAULT_FIRST_TASK_INSTRUCTION =
  "Before doing any work, create and switch to a dedicated git branch for this task if you are not already on one. If the workspace is already on a dedicated task branch, keep using it. Do all work for this task on that branch.";

type TaskRunCallbackInfo = {
  backendBaseUrl: string;
  callbackToken: string;
  executionId: string;
};

export async function promptTaskAssistantSession(args: {
  directory: string;
  model?: string;
  provider?: string;
  prompt: string;
  sessionId: string;
  taskRun: TaskRunCallbackInfo;
}): Promise<void> {
  const { client } = await createLocalRunnerOpencodeClient({
    directory: args.directory,
  });
  const abortController = new AbortController();
  const eventStream = await client.event.subscribe({
    query: { directory: args.directory },
    signal: abortController.signal,
    sseMaxRetryAttempts: 0,
  });

  try {
    const idlePromise = relayTaskRunEvents({
      directory: args.directory,
      client,
      sessionId: args.sessionId,
      stream: eventStream.stream,
      taskRun: args.taskRun,
    });
    const prompt = await buildTaskPrompt({
      client,
      directory: args.directory,
      prompt: args.prompt,
      sessionId: args.sessionId,
    });

    await promptAssistantSession({
      directory: args.directory,
      model: args.model,
      prompt,
      provider: args.provider,
      sessionId: args.sessionId,
    });

    await idlePromise;

    const assistantOutput = await readLatestAssistantOutput({
      client,
      directory: args.directory,
      sessionId: args.sessionId,
    });
    const branch = await readCurrentBranch({
      client,
      directory: args.directory,
    });

    await postTaskRunCallback({
      body: {
        assistantOutput: assistantOutput.length > 0 ? assistantOutput : undefined,
      },
      taskRun: args.taskRun,
      type: "complete",
    });

    await postTaskRunCallback({
      body: { branch },
      taskRun: args.taskRun,
      type: "branch",
    });
  } catch (error) {
    await postTaskRunCallback({
      body: {
        error: error instanceof Error ? error.message : String(error),
      },
      taskRun: args.taskRun,
      type: "fail",
    }).catch(() => undefined);

    throw error;
  } finally {
    abortController.abort();
  }
}

async function buildTaskPrompt(args: {
  client: OpencodeClient;
  directory: string;
  prompt: string;
  sessionId: string;
}): Promise<string> {
  const hasConversation = await sessionHasConversation(args);

  if (hasConversation) {
    return args.prompt;
  }

  return `${DEFAULT_FIRST_TASK_INSTRUCTION}\n\nTask:\n${args.prompt}`;
}

async function sessionHasConversation(args: {
  client: OpencodeClient;
  directory: string;
  sessionId: string;
}): Promise<boolean> {
  const response = await args.client.session.messages({
    path: { id: args.sessionId },
    query: {
      directory: args.directory,
      limit: 20,
    },
  });

  if (!response.response.ok || !response.data) {
    return false;
  }

  return response.data.some((message) => {
    const role = message.info.role;
    return role === "user" || role === "assistant";
  });
}

async function relayTaskRunEvents(args: {
  directory: string;
  client: OpencodeClient;
  sessionId: string;
  stream: AsyncGenerator<OpenCodeEvent, unknown, unknown>;
  taskRun: TaskRunCallbackInfo;
}): Promise<void> {
  let reportedBranch = await readCurrentBranch({
    client: args.client,
    directory: args.directory,
  });

  for await (const event of args.stream) {
    if (!shouldRelayTaskEvent(event, args.sessionId, args.directory)) {
      continue;
    }

    await postTaskRunCallback({
      body: { event },
      taskRun: args.taskRun,
      type: "event",
    });

    if (event.type === "vcs.branch.updated") {
      const branch = await readCurrentBranch({
        client: args.client,
        directory: args.directory,
      });

      if (branch !== reportedBranch) {
        reportedBranch = branch;

        await postTaskRunCallback({
          body: { branch },
          taskRun: args.taskRun,
          type: "branch",
        });
      }
    }

    if (event.type === "session.error" && event.properties.sessionID === args.sessionId) {
      throw new Error(getSessionErrorMessage(event));
    }

    if (event.type === "session.idle" && event.properties.sessionID === args.sessionId) {
      return;
    }
  }

  throw new Error("OpenCode event stream ended before the session became idle");
}

async function readLatestAssistantOutput(args: {
  client: OpencodeClient;
  directory: string;
  sessionId: string;
}): Promise<string> {
  const response = await args.client.session.messages({
    path: { id: args.sessionId },
    query: {
      directory: args.directory,
      limit: 100,
    },
  });

  if (!response.response.ok || !response.data) {
    return "";
  }

  const assistantMessage = [...response.data]
    .toReversed()
    .find((message) => message.info.role === "assistant");

  if (!assistantMessage) {
    return "";
  }

  return assistantMessage.parts
    .filter((part): part is TextPart => part.type === "text" && !part.ignored)
    .map((part) => part.text)
    .join("")
    .trim();
}

async function readCurrentBranch(args: {
  client: OpencodeClient;
  directory: string;
}): Promise<string | null> {
  const response = await args.client.vcs.get({
    query: { directory: args.directory },
  });

  if (!response.response.ok || !response.data?.branch) {
    return null;
  }

  const branch = response.data.branch.trim();
  return branch.length > 0 ? branch : null;
}

function shouldRelayTaskEvent(event: OpenCodeEvent, sessionId: string, directory: string): boolean {
  switch (event.type) {
    case "command.executed":
    case "permission.replied":
    case "session.idle":
    case "session.status":
    case "todo.updated":
      return event.properties.sessionID === sessionId;
    case "message.part.removed":
      return event.properties.sessionID === sessionId;
    case "message.part.updated":
      return event.properties.part.sessionID === sessionId;
    case "message.updated":
      return event.properties.info.sessionID === sessionId;
    case "permission.updated":
      return event.properties.sessionID === sessionId;
    case "session.compacted":
      return event.properties.sessionID === sessionId;
    case "session.error":
      return event.properties.sessionID === sessionId;
    case "session.updated":
      return event.properties.info.id === sessionId;
    case "vcs.branch.updated":
      return isVcsBranchEventForCurrentDirectory(event, directory);
    default:
      return false;
  }
}

function isVcsBranchEventForCurrentDirectory(
  event: Extract<OpenCodeEvent, { type: "vcs.branch.updated" }>,
  directory: string,
): boolean {
  const properties = event.properties as Record<string, unknown>;
  const root = properties.root;
  const cwd = properties.cwd;

  return (
    root === directory || cwd === directory || (typeof root !== "string" && typeof cwd !== "string")
  );
}

function getSessionErrorMessage(event: Extract<OpenCodeEvent, { type: "session.error" }>): string {
  const explicitMessage = event.properties.error?.data?.message;
  if (typeof explicitMessage === "string" && explicitMessage.trim().length > 0) {
    return explicitMessage;
  }

  return "Session failed";
}

async function postTaskRunCallback(args: {
  body: unknown;
  taskRun: TaskRunCallbackInfo;
  type: "branch" | "complete" | "event" | "fail";
}): Promise<void> {
  const baseUrl = args.taskRun.backendBaseUrl.endsWith("/")
    ? args.taskRun.backendBaseUrl.slice(0, -1)
    : args.taskRun.backendBaseUrl;
  const response = await fetch(
    `${baseUrl}/api/internal/task-runs/${args.taskRun.executionId}/${args.type}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.taskRun.callbackToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args.body),
    },
  );

  if (!response.ok) {
    const text = (await response.text()).trim();
    throw new Error(
      `Task run callback ${args.type} failed (${response.status} ${response.statusText})${
        text.length > 0 ? `: ${text}` : ""
      }`,
    );
  }
}

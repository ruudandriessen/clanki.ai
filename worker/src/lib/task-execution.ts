import { desc, eq } from "drizzle-orm";
import type { Event as OpencodeEvent } from "@opencode-ai/sdk";
import type { AppDb } from "../db/client";
import * as schema from "../db/schema";
import { createInstallationToken, buildAuthenticatedCloneUrl, type GitHubAppEnv } from "./github";
import { readProviderAuthFromSandbox } from "./opencode-auth";
import { buildTaskSandboxId, toProviderModelRef, type SupportedOpencodeProvider } from "./opencode";
import { getDecryptedProviderAuth, upsertProviderAuthCredential } from "./provider-credentials";
import { getTaskSandbox, getOpenCodeClient, type SandboxEnv } from "./sandbox";
import type { SecretCryptoEnv } from "./secret-crypto";
import { type DurableStreamsEnv } from "./durable-streams";
import { appendTaskEvent } from "./task-run-events";

type TaskExecutionEnv = SandboxEnv & GitHubAppEnv & SecretCryptoEnv & DurableStreamsEnv;
type EventStreamSandbox = {
  containerFetch(
    requestOrUrl: Request | string | URL,
    portOrInit?: number | RequestInit,
    portParam?: number,
  ): Promise<Response>;
};
type AssistantStreamCapture = {
  textPartsByMessageId: Map<string, Map<string, string>>;
  persistedAssistantMessageIds: Set<string>;
  lastPersistedTaskMessageId: string | null;
  persistedAssistantMessageCount: number;
};

const OPENCODE_SERVER_PORT = 4096;
const MAX_EVENT_STREAM_RETRY_ATTEMPTS = 4;
const EVENT_STREAM_RETRY_BASE_DELAY_MS = 500;

export async function executeTaskPrompt(args: {
  db: AppDb;
  env: TaskExecutionEnv;
  executionId: string;
  taskId: string;
  organizationId: string;
  taskTitle: string;
  prompt: string;
  repoUrl: string;
  installationId: number | null;
  setupCommand: string | null;
  initiatedByUserId: string;
  initiatedByUserName: string;
  initiatedByUserEmail: string;
  provider: SupportedOpencodeProvider;
  model: string;
}): Promise<void> {
  const {
    db,
    env,
    executionId,
    taskId,
    organizationId,
    taskTitle,
    prompt,
    repoUrl,
    installationId,
    setupCommand,
    initiatedByUserId,
    initiatedByUserName,
    initiatedByUserEmail,
    provider,
    model,
  } = args;

  try {
    const sandboxId = buildTaskSandboxId({ taskId });
    const sandbox = getTaskSandbox(env, sandboxId);

    await db
      .update(schema.tasks)
      .set({ sandboxId, status: "running", updatedAt: Date.now() })
      .where(eq(schema.tasks.id, taskId));

    // Generate a fresh installation token (needed for clone, push, and gh CLI)
    const repoDir = "/home/user/repo";
    let gitToken: string | null = null;
    if (installationId) {
      gitToken = await createInstallationToken(env, installationId);
      // Expose the token so OpenCode can use `gh` CLI for PRs, issues, etc.
      await sandbox.setEnvVars({ GITHUB_TOKEN: gitToken });
    }

    const gitIdentity = resolveGitIdentity({
      userId: initiatedByUserId,
      userName: initiatedByUserName,
      userEmail: initiatedByUserEmail,
    });
    const gitConfigResult = await sandbox.exec(
      [
        `git config --global user.name ${shellQuote(gitIdentity.name)}`,
        `git config --global user.email ${shellQuote(gitIdentity.email)}`,
      ].join(" && "),
    );
    if (!gitConfigResult.success) {
      throw new Error(
        formatGitConfigFailure({
          name: gitIdentity.name,
          email: gitIdentity.email,
          exitCode: gitConfigResult.exitCode,
          stdout: gitConfigResult.stdout,
          stderr: gitConfigResult.stderr,
        }),
      );
    }

    // Clone repo on first use (gitCheckout is a no-op if dir already exists on a warm sandbox)
    const needsClone = !(await sandbox.exists(repoDir)).exists;
    if (needsClone) {
      const cloneUrl = gitToken ? buildAuthenticatedCloneUrl(repoUrl, gitToken) : repoUrl;
      await sandbox.gitCheckout(cloneUrl, { targetDir: repoDir });

      const normalizedSetupCommand = setupCommand?.trim() ?? "";
      if (normalizedSetupCommand.length > 0) {
        const setupResult = await sandbox.exec(normalizedSetupCommand, { cwd: repoDir });
        if (!setupResult.success) {
          throw new Error(
            formatSetupCommandFailure({
              command: normalizedSetupCommand,
              exitCode: setupResult.exitCode,
              stdout: setupResult.stdout,
              stderr: setupResult.stderr,
            }),
          );
        }
      }
    } else if (gitToken) {
      // Update the remote URL with the fresh token so pushes work on warm sandboxes
      const freshUrl = buildAuthenticatedCloneUrl(repoUrl, gitToken);
      await sandbox.exec(`git -C ${repoDir} remote set-url origin '${freshUrl}'`);
    }

    const providerAuth = await getDecryptedProviderAuth(db, env, initiatedByUserId, provider);
    if (!providerAuth) {
      throw new Error(`No ${provider} credentials configured. Add them in Settings first.`);
    }

    // Start or connect to the OpenCode server and get a typed client
    const { client } = await getOpenCodeClient(sandbox, repoDir, {
      enabled_providers: [provider],
      model: toProviderModelRef(provider, model),
    });
    await client.auth.set({
      path: { id: provider },
      body: providerAuth,
    });

    // Reuse an existing OpenCode session or create a new one
    const task = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, taskId),
      columns: { sessionId: true },
    });

    let sessionId = task?.sessionId ?? null;
    if (!sessionId) {
      const { data: session } = await client.session.create({
        body: { title: taskTitle },
      });
      sessionId = session?.id ?? null;
      if (!sessionId) {
        throw new Error("Failed to create OpenCode session");
      }
    }

    await db
      .update(schema.tasks)
      .set({
        sessionId,
        sandboxId,
        updatedAt: Date.now(),
      })
      .where(eq(schema.tasks.id, taskId));

    const streamAbortController = new AbortController();
    const assistantStreamCapture = createAssistantStreamCapture();
    const streamPromise = streamSessionEvents({
      db,
      env,
      sandbox,
      executionId,
      taskId,
      organizationId,
      sessionId,
      directory: repoDir,
      signal: streamAbortController.signal,
      capture: assistantStreamCapture,
    });

    let response: { parts?: unknown } | undefined;
    try {
      // Send the prompt and wait for a response while events are captured via /event SSE.
      const result = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text: prompt }],
        },
      });
      response = result.data;
    } finally {
      streamAbortController.abort();
      await streamPromise;
    }

    // Persist the latest auth payload in case provider refresh tokens rotated.
    try {
      const refreshedAuth = await readProviderAuthFromSandbox(sandbox, provider);
      if (refreshedAuth) {
        await upsertProviderAuthCredential(db, env, initiatedByUserId, provider, refreshedAuth);
      }
    } catch {}

    // Extract text from the response parts. If no assistant message was persisted
    // from live events, persist this as a fallback output message.
    const output = extractTextFromParts(response?.parts).trim();
    const assistantOutput = output.length > 0 ? output : "OpenCode completed without text output.";

    if (!assistantStreamCapture.lastPersistedTaskMessageId) {
      await insertAssistantTaskMessage({
        db,
        organizationId,
        taskId,
        content: assistantOutput,
      });
      await appendTaskEvent({
        env,
        executionId,
        taskId,
        organizationId,
        kind: "assistant",
        payload: assistantOutput,
      });
    }

    const finishedAt = Date.now();
    await db
      .update(schema.tasks)
      .set({ status: "open", error: null, updatedAt: finishedAt })
      .where(eq(schema.tasks.id, taskId));
  } catch (error) {
    await markTaskFailed({
      db,
      taskId,
      message: getErrorMessage(error),
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractTextFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) {
    return "";
  }

  const chunks: string[] = [];
  for (const part of parts) {
    if (part && typeof part === "object" && "type" in part && part.type === "text") {
      const text = (part as { text?: string }).text;
      if (typeof text === "string" && text.trim().length > 0) {
        chunks.push(text.trim());
      }
    }
  }
  return chunks.join("\n\n");
}

function truncateCommandOutput(value: string, maxLength = 2000): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n...truncated...`;
}

function formatSetupCommandFailure(args: {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}): string {
  const stdout = truncateCommandOutput(args.stdout.trim());
  const stderr = truncateCommandOutput(args.stderr.trim());
  const output = [stderr, stdout].filter((part) => part.length > 0).join("\n\n");

  if (output.length === 0) {
    return `Project setup command failed (exit code ${args.exitCode}): ${args.command}`;
  }

  return `Project setup command failed (exit code ${args.exitCode}): ${args.command}\n${output}`;
}

function resolveGitIdentity(args: { userId: string; userName: string; userEmail: string }): {
  name: string;
  email: string;
} {
  const name = args.userName.trim().length > 0 ? args.userName.trim() : "Clanki User";
  const email =
    args.userEmail.trim().length > 0
      ? args.userEmail.trim()
      : `user+${args.userId.slice(0, 12)}@users.noreply.github.com`;
  return { name, email };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function formatGitConfigFailure(args: {
  name: string;
  email: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}): string {
  const stdout = truncateCommandOutput(args.stdout.trim());
  const stderr = truncateCommandOutput(args.stderr.trim());
  const output = [stderr, stdout].filter((part) => part.length > 0).join("\n\n");
  const base = `Failed to configure git identity (${args.name} <${args.email}>) (exit code ${args.exitCode})`;

  if (output.length === 0) {
    return base;
  }

  return `${base}\n${output}`;
}

async function streamSessionEvents(args: {
  db: AppDb;
  env: TaskExecutionEnv;
  sandbox: EventStreamSandbox;
  executionId: string;
  taskId: string;
  organizationId: string;
  sessionId: string;
  directory: string;
  signal: AbortSignal;
  capture: AssistantStreamCapture;
}): Promise<void> {
  const {
    db,
    env,
    sandbox,
    executionId,
    taskId,
    organizationId,
    sessionId,
    directory,
    signal,
    capture,
  } = args;

  for (let attempt = 1; attempt <= MAX_EVENT_STREAM_RETRY_ATTEMPTS; attempt++) {
    if (signal.aborted) {
      return;
    }

    try {
      const sawSessionIdle = await consumeSessionEventStream({
        db,
        sandbox,
        executionId,
        taskId,
        organizationId,
        env,
        sessionId,
        directory,
        signal,
        capture,
      });

      if (sawSessionIdle || signal.aborted) {
        return;
      }

      throw new Error("OpenCode event stream ended before session completed");
    } catch (error) {
      if (signal.aborted || isAbortError(error)) {
        return;
      }

      const transient = isTransientNetworkDisconnect(error);
      const hasRemainingAttempts = attempt < MAX_EVENT_STREAM_RETRY_ATTEMPTS;

      if (transient && hasRemainingAttempts) {
        console.warn("OpenCode event stream disconnected; retrying", {
          executionId,
          sessionId,
          attempt,
          message: getErrorMessage(error),
        });
        await sleepWithAbort(EVENT_STREAM_RETRY_BASE_DELAY_MS * Math.max(1, attempt), signal);
        continue;
      }

      console.error("Failed to subscribe to OpenCode event stream", {
        executionId,
        sessionId,
        message: getErrorMessage(error),
      });

      return;
    }
  }
}

async function consumeSessionEventStream(args: {
  db: AppDb;
  env: TaskExecutionEnv;
  sandbox: EventStreamSandbox;
  executionId: string;
  taskId: string;
  organizationId: string;
  sessionId: string;
  directory: string;
  signal: AbortSignal;
  capture: AssistantStreamCapture;
}): Promise<boolean> {
  const {
    db,
    env,
    sandbox,
    executionId,
    taskId,
    organizationId,
    sessionId,
    directory,
    signal,
    capture,
  } = args;

  const query = new URLSearchParams({ directory }).toString();
  const url = `https://sandbox/event${query.length > 0 ? `?${query}` : ""}`;

  const response = await sandbox.containerFetch(
    url,
    {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      },
    },
    OPENCODE_SERVER_PORT,
  );

  if (!response.ok) {
    const details = (await response.text()).trim();
    throw new Error(
      `OpenCode /event failed (${response.status} ${response.statusText})${
        details.length > 0 ? `: ${details}` : ""
      }`,
    );
  }

  if (!response.body) {
    throw new Error("OpenCode /event returned no response body");
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const onAbort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", onAbort);
  let buffer = "";

  try {
    while (true) {
      if (signal.aborted) {
        return false;
      }

      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += value;
      const chunks = buffer.split(/\r?\n\r?\n/);
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        const parsed = parseSseEventData(chunk);
        if (!isOpencodeEvent(parsed)) {
          continue;
        }
        if (!eventBelongsToSession(parsed, sessionId)) {
          continue;
        }

        collectAssistantTextPart(parsed, capture);
        if (isCompletedAssistantMessageEvent(parsed)) {
          const completedMessageId = getMessageIdFromEvent(parsed);
          const persistedTaskMessageId =
            completedMessageId === null
              ? null
              : await persistCompletedAssistantMessage({
                  db,
                  env,
                  executionId,
                  taskId,
                  organizationId,
                  opencodeMessageId: completedMessageId,
                  capture,
                });

          console.info("OpenCode assistant message completed", {
            executionId,
            sessionId,
            messageId: completedMessageId,
            persistedTaskMessageId,
          });
        }
        await appendTaskEvent({
          env,
          executionId,
          taskId,
          organizationId,
          kind: `opencode.${parsed.type}`,
          payload: safeJsonStringify(parsed),
        });

        if (isSessionIdleEvent(parsed, sessionId)) {
          return true;
        }
      }
    }

    return false;
  } finally {
    signal.removeEventListener("abort", onAbort);
    try {
      await reader.cancel();
    } catch {}
    reader.releaseLock();
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unknown task execution failure";
}

function isOpencodeEvent(value: unknown): value is OpencodeEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (!("type" in value) || typeof value.type !== "string") {
    return false;
  }

  return "properties" in value;
}

function eventBelongsToSession(event: OpencodeEvent, sessionId: string): boolean {
  return extractEventSessionId(event) === sessionId;
}

function isSessionIdleEvent(event: OpencodeEvent, sessionId: string): boolean {
  if (event.type !== "session.idle") {
    return false;
  }

  const eventSessionId = extractEventSessionId(event);
  return eventSessionId === sessionId;
}

function isCompletedAssistantMessageEvent(event: OpencodeEvent): boolean {
  if (event.type !== "message.updated") {
    return false;
  }

  const properties = toRecord(event.properties);
  const info = toRecord(properties?.info);
  if (!info) {
    return false;
  }

  if (toStringOrNull(info.role) !== "assistant") {
    return false;
  }

  const time = toRecord(info.time);
  return typeof time?.completed === "number";
}

function getMessageIdFromEvent(event: OpencodeEvent): string | null {
  const properties = toRecord(event.properties);
  const info = toRecord(properties?.info);
  return toStringOrNull(info?.id);
}

function createAssistantStreamCapture(): AssistantStreamCapture {
  return {
    textPartsByMessageId: new Map(),
    persistedAssistantMessageIds: new Set(),
    lastPersistedTaskMessageId: null,
    persistedAssistantMessageCount: 0,
  };
}

function collectAssistantTextPart(event: OpencodeEvent, capture: AssistantStreamCapture): void {
  if (event.type !== "message.part.updated") {
    return;
  }

  const properties = toRecord(event.properties);
  const part = toRecord(properties?.part);
  if (!part || toStringOrNull(part.type) !== "text") {
    return;
  }

  const messageId = toStringOrNull(part.messageID);
  const partId = toStringOrNull(part.id);
  if (!messageId || !partId) {
    return;
  }

  const text = toStringOrNull(part.text) ?? "";
  const parts = capture.textPartsByMessageId.get(messageId) ?? new Map<string, string>();
  parts.set(partId, text);
  capture.textPartsByMessageId.set(messageId, parts);
}

function getAssistantTextForMessage(
  capture: AssistantStreamCapture,
  opencodeMessageId: string,
): string | null {
  const parts = capture.textPartsByMessageId.get(opencodeMessageId);
  if (!parts) {
    return null;
  }

  const text = Array.from(parts.values()).join("").trim();
  return text.length > 0 ? text : null;
}

async function persistCompletedAssistantMessage(args: {
  db: AppDb;
  env: TaskExecutionEnv;
  executionId: string;
  taskId: string;
  organizationId: string;
  opencodeMessageId: string;
  capture: AssistantStreamCapture;
}): Promise<string | null> {
  const { db, env, executionId, taskId, organizationId, opencodeMessageId, capture } = args;

  if (capture.persistedAssistantMessageIds.has(opencodeMessageId)) {
    return null;
  }

  const content = getAssistantTextForMessage(capture, opencodeMessageId);
  if (!content) {
    return null;
  }

  const taskMessageId = await insertAssistantTaskMessage({
    db,
    organizationId,
    taskId,
    content,
  });
  capture.persistedAssistantMessageIds.add(opencodeMessageId);
  capture.lastPersistedTaskMessageId = taskMessageId;
  capture.persistedAssistantMessageCount += 1;

  await appendTaskEvent({
    env,
    executionId,
    taskId,
    organizationId,
    kind: "assistant",
    payload: content,
  });
  return taskMessageId;
}

async function insertAssistantTaskMessage(args: {
  db: AppDb;
  organizationId: string;
  taskId: string;
  content: string;
}): Promise<string> {
  const { db, organizationId, taskId, content } = args;

  const taskMessageId = crypto.randomUUID();
  const createdAt = await getNextTaskMessageTimestamp(db, taskId);

  await db.insert(schema.taskMessages).values({
    id: taskMessageId,
    organizationId,
    taskId,
    role: "assistant",
    content,
    createdAt,
  });

  return taskMessageId;
}

function extractEventSessionId(event: OpencodeEvent): string | null {
  const properties = toRecord(event.properties);
  if (!properties) {
    return null;
  }

  const directSessionId = toStringOrNull(properties.sessionID);
  if (directSessionId) {
    return directSessionId;
  }

  const info = toRecord(properties.info);
  const infoSessionId = toStringOrNull(info?.sessionID);
  if (infoSessionId) {
    return infoSessionId;
  }
  if (event.type.startsWith("session.")) {
    const infoId = toStringOrNull(info?.id);
    if (infoId) {
      return infoId;
    }
  }

  const part = toRecord(properties.part);
  const partSessionId = toStringOrNull(part?.sessionID);
  if (partSessionId) {
    return partSessionId;
  }

  return null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isTransientNetworkDisconnect(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("network connection lost") ||
    message.includes("container suddenly disconnected") ||
    message.includes("stream ended before session completed")
  );
}

function parseSseEventData(chunk: string): unknown {
  const lines = chunk.split(/\r?\n/);
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line.startsWith("data:")) {
      continue;
    }
    dataLines.push(line.replace(/^data:\s?/, ""));
  }

  if (dataLines.length === 0) {
    return null;
  }

  const data = dataLines.join("\n").trim();
  if (data.length === 0 || data === "[DONE]") {
    return null;
  }

  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeoutId = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
      resolve();
    };

    signal.addEventListener("abort", onAbort);
  });
}

async function getNextTaskMessageTimestamp(db: AppDb, taskId: string): Promise<number> {
  const now = Date.now();
  const latest = await db.query.taskMessages.findFirst({
    where: eq(schema.taskMessages.taskId, taskId),
    columns: { createdAt: true },
    orderBy: desc(schema.taskMessages.createdAt),
  });

  if (!latest?.createdAt) {
    return now;
  }

  return latest.createdAt >= now ? latest.createdAt + 1 : now;
}

async function markTaskFailed(args: { db: AppDb; taskId: string; message: string }): Promise<void> {
  const { db, taskId, message } = args;
  const finishedAt = Date.now();

  try {
    await db
      .update(schema.tasks)
      .set({
        status: "open",
        error: message,
        updatedAt: finishedAt,
      })
      .where(eq(schema.tasks.id, taskId));
  } catch {}
}

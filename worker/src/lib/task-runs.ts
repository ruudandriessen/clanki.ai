import { and, desc, eq, isNull, not } from "drizzle-orm";
import type { Event as OpencodeEvent } from "@opencode-ai/sdk";
import type { AppDb } from "../db/client";
import * as schema from "../db/schema";
import { createInstallationToken, buildAuthenticatedCloneUrl, type GitHubAppEnv } from "./github";
import { readProviderAuthFromSandbox } from "./opencode-auth";
import {
  buildTaskRunSandboxId,
  toProviderModelRef,
  type SupportedOpencodeProvider,
} from "./opencode";
import { getDecryptedProviderAuth, upsertProviderAuthCredential } from "./provider-credentials";
import { getTaskSandbox, getOpenCodeClient, type SandboxEnv } from "./sandbox";
import type { SecretCryptoEnv } from "./secret-crypto";
import { type DurableStreamsEnv } from "./durable-streams";
import { appendTaskRunEvent } from "./task-run-events";

type TaskRunEnv = SandboxEnv & GitHubAppEnv & SecretCryptoEnv & DurableStreamsEnv;
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

export async function executeTaskRun(args: {
  db: AppDb;
  env: TaskRunEnv;
  runId: string;
  taskId: string;
  organizationId: string;
  taskTitle: string;
  prompt: string;
  repoUrl: string;
  installationId: number | null;
  setupCommand: string | null;
  initiatedByUserId: string;
  provider: SupportedOpencodeProvider;
  model: string;
}): Promise<void> {
  const {
    db,
    env,
    runId,
    taskId,
    organizationId,
    taskTitle,
    prompt,
    repoUrl,
    installationId,
    setupCommand,
    initiatedByUserId,
    provider,
    model,
  } = args;

  try {
    const startedAt = Date.now();
    await db
      .update(schema.taskRuns)
      .set({
        status: "running",
        startedAt,
        updatedAt: startedAt,
        error: null,
      })
      .where(eq(schema.taskRuns.id, runId));

    // Scope sandbox by task+user+provider+model to avoid cross-user/provider leakage.
    const sandboxId = buildTaskRunSandboxId({
      taskId,
      userId: initiatedByUserId,
      provider,
      model,
    });
    const sandbox = getTaskSandbox(env, sandboxId);

    await db
      .update(schema.taskRuns)
      .set({ sandboxId, updatedAt: Date.now() })
      .where(eq(schema.taskRuns.id, runId));

    // Generate a fresh installation token (needed for clone, push, and gh CLI)
    const repoDir = "/home/user/repo";
    let gitToken: string | null = null;
    if (installationId) {
      gitToken = await createInstallationToken(env, installationId);
      // Expose the token so OpenCode can use `gh` CLI for PRs, issues, etc.
      await sandbox.setEnvVars({ GITHUB_TOKEN: gitToken });
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

    // Detect and emit the current git branch
    let lastKnownBranch: string | null = null;
    try {
      lastKnownBranch = await detectAndEmitBranch({
        sandbox,
        db,
        env,
        runId,
        taskId,
        organizationId,
        repoDir,
        lastKnown: null,
      });
    } catch {}

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

    // Reuse an existing OpenCode session from a previous run, or create a new one
    const previousRun = await db.query.taskRuns.findFirst({
      where: and(
        eq(schema.taskRuns.taskId, taskId),
        eq(schema.taskRuns.tool, "opencode"),
        eq(schema.taskRuns.initiatedByUserId, initiatedByUserId),
        eq(schema.taskRuns.provider, provider),
        eq(schema.taskRuns.model, model),
        not(isNull(schema.taskRuns.sessionId)),
      ),
      columns: { sessionId: true },
      orderBy: desc(schema.taskRuns.createdAt),
    });

    let sessionId = previousRun?.sessionId ?? null;
    if (!sessionId) {
      const { data: session } = await client.session.create({
        body: { title: taskTitle },
      });
      sessionId = session?.id ?? null;
      if (!sessionId) {
        throw new Error("Failed to create OpenCode session");
      }
    }

    const runUpdatedAt = Date.now();
    await db
      .update(schema.taskRuns)
      .set({
        sessionId,
        sandboxId,
        updatedAt: runUpdatedAt,
      })
      .where(eq(schema.taskRuns.id, runId));
    const streamAbortController = new AbortController();
    const assistantStreamCapture = createAssistantStreamCapture();
    const streamPromise = streamSessionEvents({
      db,
      env,
      sandbox,
      runId,
      taskId,
      organizationId,
      sessionId,
      directory: repoDir,
      signal: streamAbortController.signal,
      capture: assistantStreamCapture,
    });

    // Poll for branch changes while the run is active
    const branchPollInterval = setInterval(async () => {
      try {
        lastKnownBranch = await detectAndEmitBranch({
          sandbox,
          db,
          env,
          runId,
          taskId,
          organizationId,
          repoDir,
          lastKnown: lastKnownBranch,
        });
      } catch {}
    }, 5000);

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
      clearInterval(branchPollInterval);
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

    // Final branch check after the run completes
    try {
      lastKnownBranch = await detectAndEmitBranch({
        sandbox,
        db,
        env,
        runId,
        taskId,
        organizationId,
        repoDir,
        lastKnown: lastKnownBranch,
      });
    } catch {}

    // Extract text from the response parts. If no assistant message was persisted
    // from live events, persist this as a fallback output message.
    const output = extractTextFromParts(response?.parts).trim();
    const assistantOutput = output.length > 0 ? output : "OpenCode completed without text output.";
    let assistantMessageId = assistantStreamCapture.lastPersistedTaskMessageId;

    if (!assistantMessageId) {
      assistantMessageId = await insertAssistantTaskMessage({
        db,
        organizationId,
        taskId,
        content: assistantOutput,
      });
      await appendTaskRunEvent({
        env,
        runId,
        taskId,
        organizationId,
        kind: "assistant",
        payload: assistantOutput,
      });
    }

    const finishedAt = Date.now();
    await db
      .update(schema.taskRuns)
      .set({
        status: "succeeded",
        sessionId,
        sandboxId,
        outputMessageId: assistantMessageId,
        finishedAt,
        updatedAt: finishedAt,
        error: null,
      })
      .where(eq(schema.taskRuns.id, runId));

    await db
      .update(schema.tasks)
      .set({ status: "open", updatedAt: finishedAt })
      .where(eq(schema.tasks.id, taskId));
  } catch (error) {
    await markRunFailed({
      db,
      runId,
      taskId,
      message: getErrorMessage(error),
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function detectAndEmitBranch(args: {
  sandbox: { exec(command: string): Promise<{ exitCode: number; stdout: string }> };
  db: AppDb;
  env: DurableStreamsEnv;
  runId: string;
  taskId: string;
  organizationId: string;
  repoDir: string;
  lastKnown: string | null;
}): Promise<string | null> {
  const result = await args.sandbox.exec(`git -C ${args.repoDir} rev-parse --abbrev-ref HEAD`);
  const branch = result.stdout.trim();
  if (result.exitCode !== 0 || branch.length === 0 || branch === args.lastKnown) {
    return args.lastKnown;
  }

  await args.db
    .update(schema.taskRuns)
    .set({ branch, updatedAt: Date.now() })
    .where(eq(schema.taskRuns.id, args.runId));

  await appendTaskRunEvent({
    env: args.env,
    runId: args.runId,
    taskId: args.taskId,
    organizationId: args.organizationId,
    kind: "branch",
    payload: branch,
  });

  return branch;
}

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

async function streamSessionEvents(args: {
  db: AppDb;
  env: TaskRunEnv;
  sandbox: EventStreamSandbox;
  runId: string;
  taskId: string;
  organizationId: string;
  sessionId: string;
  directory: string;
  signal: AbortSignal;
  capture: AssistantStreamCapture;
}): Promise<void> {
  const { db, env, sandbox, runId, taskId, organizationId, sessionId, directory, signal, capture } =
    args;

  for (let attempt = 1; attempt <= MAX_EVENT_STREAM_RETRY_ATTEMPTS; attempt++) {
    if (signal.aborted) {
      return;
    }

    try {
      const sawSessionIdle = await consumeSessionEventStream({
        db,
        sandbox,
        runId,
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
          runId,
          sessionId,
          attempt,
          message: getErrorMessage(error),
        });
        await sleepWithAbort(EVENT_STREAM_RETRY_BASE_DELAY_MS * Math.max(1, attempt), signal);
        continue;
      }

      console.error("Failed to subscribe to OpenCode event stream", {
        runId,
        sessionId,
        message: getErrorMessage(error),
      });

      return;
    }
  }
}

async function consumeSessionEventStream(args: {
  db: AppDb;
  env: TaskRunEnv;
  sandbox: EventStreamSandbox;
  runId: string;
  taskId: string;
  organizationId: string;
  sessionId: string;
  directory: string;
  signal: AbortSignal;
  capture: AssistantStreamCapture;
}): Promise<boolean> {
  const { db, env, sandbox, runId, taskId, organizationId, sessionId, directory, signal, capture } =
    args;

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
                  runId,
                  taskId,
                  organizationId,
                  opencodeMessageId: completedMessageId,
                  capture,
                });

          console.info("OpenCode assistant message completed", {
            runId,
            sessionId,
            messageId: completedMessageId,
            persistedTaskMessageId,
          });
        }
        await appendTaskRunEvent({
          env,
          runId,
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

  return "Unknown task run failure";
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
  env: TaskRunEnv;
  runId: string;
  taskId: string;
  organizationId: string;
  opencodeMessageId: string;
  capture: AssistantStreamCapture;
}): Promise<string | null> {
  const { db, env, runId, taskId, organizationId, opencodeMessageId, capture } = args;

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

  await appendTaskRunEvent({
    env,
    runId,
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

async function markRunFailed(args: {
  db: AppDb;
  runId: string;
  taskId: string;
  message: string;
}): Promise<void> {
  const { db, runId, taskId, message } = args;
  const finishedAt = Date.now();

  try {
    await db
      .update(schema.taskRuns)
      .set({
        status: "failed",
        finishedAt,
        updatedAt: finishedAt,
        error: message,
      })
      .where(eq(schema.taskRuns.id, runId));
  } catch {}

  try {
    await db
      .update(schema.tasks)
      .set({ status: "open", updatedAt: finishedAt })
      .where(eq(schema.tasks.id, taskId));
  } catch {}
}

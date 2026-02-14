import { and, desc, eq, isNull, not } from "drizzle-orm";
import type { Event as OpencodeEvent, OpencodeClient } from "@opencode-ai/sdk";
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

type TaskRunEnv = SandboxEnv & GitHubAppEnv & SecretCryptoEnv;

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

    await appendRunEvent(db, runId, "status", "running", startedAt);

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
    await appendRunEvent(db, runId, "session", sessionId, runUpdatedAt);

    const sseStream = await client.event.subscribe({
      onSseEvent: (event) => {
        console.warn("Global - New sse event", event.event, event.data);
      },
      onSseError: (error) => {
        console.warn("Global - OpenCode event stream error", {
          runId,
          sessionId,
          message: getErrorMessage(error),
        });
      },
    });
    // const streamAbortController = new AbortController();
    // const streamPromise = streamSessionEvents({
    //   db,
    //   client,
    //   runId,
    //   sessionId,
    //   directory: repoDir,
    //   signal: streamAbortController.signal,
    // });

    let response: { parts?: unknown } | undefined;
    try {
      console.warn("Sending prompt to OpenCode");
      // Send the prompt and wait for a response while events are captured via /event SSE.
      const result = await client.session.prompt({
        path: { id: sessionId },
        responseStyle: "data",
        body: {
          parts: [{ type: "text", text: prompt }],
        },
        onSseEvent: (event) => {
          console.warn("New sse event", event.event, event.data);
        },
        onSseError: (error) => {
          console.warn("OpenCode event stream error", {
            runId,
            sessionId,
            message: getErrorMessage(error),
          });
        },
      });
      response = result.data;
    } finally {
      // streamAbortController.abort();
      // await streamPromise;
    }

    // Persist the latest auth payload in case provider refresh tokens rotated.
    try {
      const refreshedAuth = await readProviderAuthFromSandbox(sandbox, provider);
      if (refreshedAuth) {
        await upsertProviderAuthCredential(db, env, initiatedByUserId, provider, refreshedAuth);
      }
    } catch {}

    // Extract text from the response parts
    const output = extractTextFromParts(response?.parts).trim();
    const assistantOutput = output.length > 0 ? output : "OpenCode completed without text output.";

    const assistantMessageId = crypto.randomUUID();
    const assistantCreatedAt = await getNextTaskMessageTimestamp(db, taskId);

    await db.insert(schema.taskMessages).values({
      id: assistantMessageId,
      organizationId,
      taskId,
      role: "assistant",
      content: assistantOutput,
      createdAt: assistantCreatedAt,
    });

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

    await db.update(schema.tasks).set({ updatedAt: finishedAt }).where(eq(schema.tasks.id, taskId));

    await appendRunEvent(db, runId, "assistant", assistantOutput);
    await appendRunEvent(db, runId, "status", "succeeded");
  } catch (error) {
    await markRunFailed(db, runId, taskId, getErrorMessage(error));
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

async function streamSessionEvents(args: {
  db: AppDb;
  client: OpencodeClient;
  runId: string;
  sessionId: string;
  directory: string;
  signal: AbortSignal;
}): Promise<void> {
  const { db, client, runId, sessionId, directory, signal } = args;
  let loggedTransientDisconnect = false;

  try {
    const { stream } = await client.event.subscribe({
      query: { directory },
      signal,
      sseMaxRetryAttempts: 2,
      onSseEvent: (event) => {
        console.warn("New sse event", event.event, event.data);
      },
      onSseError: (error) => {
        if (signal.aborted || isAbortError(error)) {
          return;
        }

        if (isTransientNetworkDisconnect(error)) {
          if (!loggedTransientDisconnect) {
            console.warn("OpenCode event stream disconnected; retrying", {
              runId,
              sessionId,
              message: getErrorMessage(error),
            });
            loggedTransientDisconnect = true;
          }
          return;
        }

        console.error("OpenCode event stream error", {
          runId,
          sessionId,
          message: getErrorMessage(error),
        });
      },
    });

    for await (const rawEvent of stream) {
      console.log("new event", rawEvent.type);
      if (signal.aborted) {
        return;
      }
      if (!isOpencodeEvent(rawEvent)) {
        continue;
      }
      if (!eventBelongsToSession(rawEvent, sessionId)) {
        continue;
      }

      await appendRunEvent(db, runId, `opencode.${rawEvent.type}`, safeJsonStringify(rawEvent));

      if (isSessionIdleEvent(rawEvent, sessionId)) {
        return;
      }
    }
  } catch (error) {
    if (signal.aborted || isAbortError(error)) {
      return;
    }

    console.error("Failed to subscribe to OpenCode event stream", {
      runId,
      sessionId,
      message: getErrorMessage(error),
    });

    try {
      await appendRunEvent(
        db,
        runId,
        "warning",
        `Failed to subscribe to OpenCode event stream: ${getErrorMessage(error)}`,
      );
    } catch {}
  }
}

async function appendRunEvent(
  db: AppDb,
  runId: string,
  kind: string,
  payload: string,
  createdAt = Date.now(),
): Promise<void> {
  await db.insert(schema.taskRunEvents).values({
    id: crypto.randomUUID(),
    runId,
    kind,
    payload,
    createdAt,
  });
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
  return message.includes("network connection lost");
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

async function markRunFailed(
  db: AppDb,
  runId: string,
  taskId: string,
  message: string,
): Promise<void> {
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
    await db.update(schema.tasks).set({ updatedAt: finishedAt }).where(eq(schema.tasks.id, taskId));
  } catch {}

  try {
    await appendRunEvent(db, runId, "error", message, finishedAt);
    await appendRunEvent(db, runId, "status", "failed");
  } catch {}
}

import { eq } from "drizzle-orm";
import type { AppDb } from "../../db/client";
import * as schema from "../../db/schema";
import type { DurableStreamsEnv } from "../durable-streams";
import { appendTaskEvent } from "../durable-streams";
import type { GitHubAppEnv } from "../github";
import type { SupportedOpencodeProvider } from "../opencode";
import { TASK_RUNNER_COMMAND, type SandboxEnv } from "../sandbox";
import type { SecretCryptoEnv } from "../secret-crypto";
import type { TaskLifecycleEventPayload } from "@/shared/task-stream-events";
import { connectAssistant, ensureSession } from "./connect-assistant";
import { getErrorMessage, markTaskRunning } from "./helpers";
import { prepareSandbox } from "./prepare-sandbox";
import {
  cloneRepository,
  decideSetupScriptRun,
  persistSetupFingerprint,
  runSetupScript,
  setupGitIdentity,
  setupGitToken,
  syncRepositoryCheckout,
} from "./setup-git";

type TaskExecutionEnv = SandboxEnv & GitHubAppEnv & SecretCryptoEnv & DurableStreamsEnv;
const FIRST_MESSAGE_SYSTEM_PROMPT =
  "System instruction: Before writing or changing any code, create a git branch based on the user message first.";
const CALLBACK_PROBE_COMMAND = `node -e "(async () => { const url = process.env.TASK_WORKER_URL + '/api/internal/task-runs/' + process.env.TASK_RUN_ID + '/heartbeat'; try { const response = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.TASK_CALLBACK_TOKEN, 'Content-Type': 'application/json' }, body: '{}' }); if (!response.ok) { const body = (await response.text()).trim(); console.error('callback probe failed: ' + response.status + ' ' + response.statusText + (body ? ': ' + body : '')); process.exit(1); } } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); } })();"`;

function buildTaskPrompt(prompt: string, isFirstMessage: boolean): string {
  if (!isFirstMessage) {
    return prompt;
  }

  return `${FIRST_MESSAGE_SYSTEM_PROMPT}\n\nUser message:\n${prompt}`;
}

async function verifySandboxCallbackReachability(args: {
  sandbox: {
    exec: (
      command: string,
      options?: { cwd?: string },
    ) => Promise<{
      success: boolean;
      exitCode: number;
      stdout: string;
      stderr: string;
    }>;
  };
  repoDir: string;
}): Promise<void> {
  const probe = await args.sandbox.exec(CALLBACK_PROBE_COMMAND, { cwd: args.repoDir });
  if (probe.success) {
    return;
  }

  const output = probe.stderr.trim().length > 0 ? probe.stderr.trim() : probe.stdout.trim();
  throw new Error(
    `Sandbox cannot reach worker callback endpoint: ${output || `exit code ${probe.exitCode}`}`,
  );
}

/**
 * Set up the sandbox and launch the autonomous task-runner script.
 *
 */
export async function executeTaskPrompt(args: {
  db: AppDb;
  env: TaskExecutionEnv;
  workerOrigin: string;
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
  callbackToken: string;
}): Promise<void> {
  const {
    db,
    env,
    workerOrigin,
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
    callbackToken,
  } = args;

  const repoDir = "/vercel/sandbox/repo";
  const streamId = `org/${organizationId}/tasks/${taskId}/events`;

  const emitLifecycleEvent = async (payload: TaskLifecycleEventPayload): Promise<void> => {
    try {
      await appendTaskEvent({
        env,
        streamId,
        event: {
          id: crypto.randomUUID(),
          taskId,
          runId: executionId,
          kind: "task.lifecycle",
          payload: JSON.stringify(payload),
          createdAt: Date.now(),
        },
      });
    } catch (error) {
      console.warn("Failed to append task lifecycle event", {
        taskId,
        executionId,
        message: getErrorMessage(error),
      });
    }
  };

  await emitLifecycleEvent({
    phase: "sandbox",
    status: "running",
    message: "Preparing sandbox",
  });
  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, taskId),
    columns: { sandboxId: true },
  });
  const { sandbox, sandboxId } = await prepareSandbox({
    env,
    sandboxId: task?.sandboxId ?? null,
  });
  await markTaskRunning({ db, taskId, sandboxId });
  await emitLifecycleEvent({
    phase: "sandbox",
    status: "completed",
    message: "Sandbox ready",
  });

  const gitToken = await setupGitToken({ env, sandbox, installationId });
  await emitLifecycleEvent({
    phase: "clone",
    status: "running",
    message: "Cloning repository",
  });
  let freshClone = false;
  let syncMessage: string | null = null;
  try {
    const [, cloneResult] = await Promise.all([
      setupGitIdentity({
        sandbox,
        userId: initiatedByUserId,
        userName: initiatedByUserName,
        userEmail: initiatedByUserEmail,
      }),
      cloneRepository({ sandbox, repoUrl, repoDir, gitToken }),
    ]);
    freshClone = cloneResult.freshClone;

    if (!freshClone) {
      const syncResult = await syncRepositoryCheckout({ sandbox, repoDir });
      switch (syncResult.status) {
        case "updated":
          syncMessage = `Updated repository from ${syncResult.previousHead.slice(0, 7)} to ${syncResult.currentHead.slice(0, 7)}`;
          break;
        case "up-to-date":
          syncMessage = `Repository already up to date at ${syncResult.currentHead.slice(0, 7)}`;
          break;
        case "skipped":
          syncMessage = `Skipped repository sync: ${syncResult.reason}`;
          break;
      }
    }
  } catch (error) {
    await emitLifecycleEvent({
      phase: "clone",
      status: "error",
      message: "Repository clone failed",
      details: getErrorMessage(error),
    });
    throw error;
  }

  await emitLifecycleEvent({
    phase: "clone",
    status: freshClone ? "completed" : "skipped",
    message: freshClone ? "Repository cloned" : "Using existing repository checkout",
    details: syncMessage ?? undefined,
  });

  const setupDecision = await decideSetupScriptRun({
    sandbox,
    repoDir,
    command: setupCommand,
    freshClone,
  });

  if (setupDecision.shouldRun) {
    const trimmedSetupCommand = setupCommand?.trim() ?? "";
    if (trimmedSetupCommand.length > 0 || setupDecision.reason.length > 0) {
      await emitLifecycleEvent({
        phase: "setup",
        status: "running",
        message: "Running setup command",
        details: [trimmedSetupCommand, setupDecision.reason]
          .filter((part) => part.length > 0)
          .join("\n"),
      });
    }

    try {
      await runSetupScript({ sandbox, command: setupCommand, repoDir });
      await persistSetupFingerprint({
        sandbox,
        fingerprint: setupDecision.fingerprint,
      });
    } catch (error) {
      await emitLifecycleEvent({
        phase: "setup",
        status: "error",
        message: "Setup command failed",
        details: getErrorMessage(error),
      });
      throw error;
    }

    await emitLifecycleEvent({
      phase: "setup",
      status: "completed",
      message: "Setup command completed",
      details: setupDecision.reason,
    });
  } else {
    await emitLifecycleEvent({
      phase: "setup",
      status: "skipped",
      message: "Setup command skipped",
      details: setupDecision.reason,
    });
  }

  await emitLifecycleEvent({
    phase: "assistant",
    status: "running",
    message: "Connecting assistant session",
  });
  let sessionId = "";
  try {
    const { client } = await connectAssistant({
      sandbox,
      repoDir,
      provider,
      model,
      db,
      env,
      userId: initiatedByUserId,
    });
    const session = await ensureSession({
      client,
      directory: repoDir,
      db,
      taskId,
      taskTitle,
      sandboxId,
    });

    const promptText = buildTaskPrompt(prompt, session.isNewSession);
    const promptResponse = await client.session.promptAsync({
      path: { id: session.sessionId },
      query: { directory: repoDir },
      body: {
        parts: [{ type: "text", text: promptText }],
      },
    });
    if (!promptResponse.response.ok) {
      const statusText = promptResponse.response.statusText.trim();
      const statusInfo =
        statusText.length > 0
          ? `${promptResponse.response.status} ${statusText}`
          : String(promptResponse.response.status);
      throw new Error(`Failed to dispatch prompt to OpenCode session (${statusInfo})`);
    }

    sessionId = session.sessionId;
  } catch (error) {
    await emitLifecycleEvent({
      phase: "assistant",
      status: "error",
      message: "Failed to initialize assistant",
      details: getErrorMessage(error),
    });
    throw error;
  }
  await emitLifecycleEvent({
    phase: "assistant",
    status: "completed",
    message: "Assistant session ready",
  });

  // Pass all context to the sandbox via environment variables.
  const workerUrl = workerOrigin.trim();
  if (workerUrl.length === 0) {
    throw new Error("workerOrigin is required");
  }

  await sandbox.setEnvVars({
    TASK_WORKER_URL: workerUrl,
    TASK_CALLBACK_TOKEN: callbackToken,
    TASK_ID: taskId,
    TASK_RUN_ID: executionId,
    TASK_ORG_ID: organizationId,
    TASK_SESSION_ID: sessionId,
    TASK_REPO_DIR: repoDir,
    TASK_DS_SERVICE_ID: env.DURABLE_STREAMS_SERVICE_ID ?? "",
    TASK_DS_SECRET: env.DURABLE_STREAMS_SECRET ?? "",
  });

  await verifySandboxCallbackReachability({ sandbox, repoDir });

  // Launch the autonomous task-runner in the background.
  // The script reads all context from env vars and handles
  // event streaming plus worker callbacks independently.
  sandbox.execDetached(TASK_RUNNER_COMMAND).catch((error) => {
    console.error("Failed to start task-runner in sandbox", {
      executionId,
      taskId,
      message: getErrorMessage(error),
    });
  });
}

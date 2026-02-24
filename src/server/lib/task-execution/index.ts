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
import { cloneRepository, runSetupScript, setupGitIdentity, setupGitToken } from "./setup-git";

type TaskExecutionEnv = SandboxEnv & GitHubAppEnv & SecretCryptoEnv & DurableStreamsEnv;

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
  });

  if (freshClone) {
    const trimmedSetupCommand = setupCommand?.trim() ?? "";
    if (trimmedSetupCommand.length > 0) {
      await emitLifecycleEvent({
        phase: "setup",
        status: "running",
        message: "Running setup command",
        details: trimmedSetupCommand,
      });
    }

    try {
      await runSetupScript({ sandbox, command: setupCommand, repoDir });
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
      status: trimmedSetupCommand.length > 0 ? "completed" : "skipped",
      message:
        trimmedSetupCommand.length > 0 ? "Setup command completed" : "No setup command configured",
    });
  } else {
    await emitLifecycleEvent({
      phase: "setup",
      status: "skipped",
      message: "Setup command skipped for existing checkout",
    });
  }

  await emitLifecycleEvent({
    phase: "assistant",
    status: "running",
    message: "Connecting assistant session",
  });
  let sessionId = "";
  let isNewSession = false;
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
    const session = await ensureSession({ client, db, taskId, taskTitle, sandboxId });
    sessionId = session.sessionId;
    isNewSession = session.isNewSession;
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
    TASK_IS_FIRST_MESSAGE: isNewSession ? "1" : "0",
    TASK_REPO_DIR: repoDir,
    TASK_PROMPT: prompt,
    TASK_DS_SERVICE_ID: env.DURABLE_STREAMS_SERVICE_ID ?? "",
    TASK_DS_SECRET: env.DURABLE_STREAMS_SECRET ?? "",
  });

  // Launch the autonomous task-runner in the background.
  // The script reads all context from env vars and handles prompt execution,
  // event streaming, and worker callbacks independently.
  sandbox.execDetached(TASK_RUNNER_COMMAND).catch((error) => {
    console.error("Failed to start task-runner in sandbox", {
      executionId,
      taskId,
      message: getErrorMessage(error),
    });
  });
}

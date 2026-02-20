import type { AppDb } from "../../db/client";
import type { DurableStreamsEnv } from "../durable-streams";
import type { GitHubAppEnv } from "../github";
import type { SupportedOpencodeProvider } from "../opencode";
import type { SandboxEnv } from "../sandbox";
import type { SecretCryptoEnv } from "../secret-crypto";
import { connectAssistant, ensureSession } from "./connect-assistant";
import { getErrorMessage, markTaskRunning } from "./helpers";
import { prepareSandbox } from "./prepare-sandbox";
import { cloneRepository, runSetupScript, setupGitIdentity, setupGitToken } from "./setup-git";

type TaskExecutionEnv = SandboxEnv & GitHubAppEnv & SecretCryptoEnv & DurableStreamsEnv;

/**
 * Set up the sandbox and launch the autonomous task-runner script.
 *
 * Returns a callback token that the sandbox will use to authenticate calls
 * back to the worker's internal API.
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
}): Promise<string> {
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
  } = args;

  const repoDir = "/home/user/repo";
  const callbackToken = crypto.randomUUID();

  const { sandbox, sandboxId } = prepareSandbox({ env, taskId });
  await markTaskRunning({ db, taskId, sandboxId });

  const gitToken = await setupGitToken({ env, sandbox, installationId });
  const [, { freshClone }] = await Promise.all([
    setupGitIdentity({
      sandbox,
      userId: initiatedByUserId,
      userName: initiatedByUserName,
      userEmail: initiatedByUserEmail,
    }),
    cloneRepository({ sandbox, repoUrl, repoDir, gitToken }),
  ]);

  if (freshClone) {
    await runSetupScript({ sandbox, command: setupCommand, repoDir });
  }

  const { client } = await connectAssistant({
    sandbox,
    repoDir,
    provider,
    model,
    db,
    env,
    userId: initiatedByUserId,
  });
  const sessionId = await ensureSession({ client, db, taskId, taskTitle, sandboxId });

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
    TASK_PROMPT: prompt,
    TASK_DS_SERVICE_ID: env.DURABLE_STREAMS_SERVICE_ID ?? "",
    TASK_DS_SECRET: env.DURABLE_STREAMS_SECRET ?? "",
  });

  // Launch the autonomous task-runner in the background.
  // The script reads all context from env vars and handles prompt execution,
  // event streaming, and worker callbacks independently.
  sandbox.exec("task-runner &").catch((error) => {
    console.error("Failed to start task-runner in sandbox", {
      executionId,
      taskId,
      message: getErrorMessage(error),
    });
  });

  return callbackToken;
}

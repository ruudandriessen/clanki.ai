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
import { getErrorMessage, markTaskRunning, setTaskPreviewUrl } from "./helpers";
import { prepareSandbox } from "./prepare-sandbox";
import {
  cloneRepository,
  runSetupScript,
  setupGitIdentity,
  setupGitToken,
  startRunScript,
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
  runCommand: string | null;
  runPort: number | null;
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
    runCommand,
    runPort,
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
    userPorts: runPort ? [runPort] : [],
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

  // Set Vite allowed hosts BEFORE starting the dev server
  if (runPort !== null) {
    try {
      const previewHost = new URL(sandbox.domain(runPort)).hostname;
      await sandbox.setEnvVars({
        __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: previewHost,
      });
      console.log("Set Vite preview host before starting dev server:", previewHost);
    } catch (error) {
      console.warn("Failed to set Vite preview hostname", {
        taskId,
        message: getErrorMessage(error),
      });
    }
  }

  const trimmedRunCommand = runCommand?.trim() ?? "";
  if (trimmedRunCommand.length > 0) {
    if (runPort === null) {
      throw new Error("Run port is required when run command is configured");
    }

    await emitLifecycleEvent({
      phase: "setup",
      status: "running",
      message: "Starting run command",
      details: `${trimmedRunCommand} (port ${runPort})`,
    });

    try {
      await startRunScript({ sandbox, command: runCommand, repoDir });
    } catch (error) {
      await emitLifecycleEvent({
        phase: "setup",
        status: "error",
        message: "Run command failed to start",
        details: getErrorMessage(error),
      });
      throw error;
    }

    const previewUrl = sandbox.domain(runPort);
    await setTaskPreviewUrl({ db, taskId, previewUrl });
    await emitLifecycleEvent({
      phase: "setup",
      status: "completed",
      message: "Run command started",
      details: previewUrl,
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

  const envVars: Record<string, string> = {
    TASK_WORKER_URL: workerUrl,
    TASK_CALLBACK_TOKEN: callbackToken,
    TASK_ID: taskId,
    TASK_RUN_ID: executionId,
    TASK_ORG_ID: organizationId,
    TASK_SESSION_ID: sessionId,
    TASK_REPO_DIR: repoDir,
    TASK_DS_SERVICE_ID: env.DURABLE_STREAMS_SERVICE_ID ?? "",
    TASK_DS_SECRET: env.DURABLE_STREAMS_SECRET ?? "",
  };

  await sandbox.setEnvVars(envVars);

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

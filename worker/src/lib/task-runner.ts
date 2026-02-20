import { DurableObject } from "cloudflare:workers";
import type { Sandbox } from "@cloudflare/sandbox";
import { getDb } from "../db/client";
import { executeTaskPrompt } from "./task-execution";
import { markTaskFailed, getErrorMessage } from "./task-execution/helpers";
import type { SupportedOpencodeProvider } from "./opencode";

type TaskRunnerEnv = {
  HYPERDRIVE: Hyperdrive;
  Sandbox: DurableObjectNamespace<Sandbox>;
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  CREDENTIALS_ENCRYPTION_KEY: string;
  DURABLE_STREAMS_SERVICE_ID?: string;
  DURABLE_STREAMS_SECRET?: string;
};

export interface TaskRunParams {
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
}

/**
 * Maximum wall-clock time we allow a single task execution to run before
 * aborting.  Cloudflare Durable Object alarms are killed after ~15 minutes of
 * wall-clock time (reported as "exceededCpu").  We set our own timeout a
 * minute earlier so that we can mark the task as failed with a clear error
 * message instead of being silently killed.
 */
const TASK_EXECUTION_TIMEOUT_MS = 14 * 60 * 1000;

/**
 * Durable Object that runs task execution via alarm(), avoiding the Worker's
 * waitUntil() wallclock time limit (~30s). The Worker calls schedule() which
 * stores params and sets an immediate alarm. The alarm handler then runs the
 * task independently with no time constraint.
 */
export class TaskRunner extends DurableObject<TaskRunnerEnv> {
  /** Store task params and schedule an immediate alarm to execute. */
  async schedule(params: TaskRunParams): Promise<void> {
    await this.ctx.storage.put("params", params);
    await this.ctx.storage.setAlarm(Date.now() + 1);
  }

  override async alarm(): Promise<void> {
    const params = await this.ctx.storage.get<TaskRunParams>("params");
    if (!params) {
      return;
    }

    // Delete params first so a crash-retry doesn't re-run with stale data.
    await this.ctx.storage.delete("params");

    try {
      const db = getDb(this.env);
      await Promise.race([
        executeTaskPrompt({
          db,
          env: this.env,
          executionId: params.executionId,
          taskId: params.taskId,
          organizationId: params.organizationId,
          taskTitle: params.taskTitle,
          prompt: params.prompt,
          repoUrl: params.repoUrl,
          installationId: params.installationId,
          setupCommand: params.setupCommand,
          initiatedByUserId: params.initiatedByUserId,
          initiatedByUserName: params.initiatedByUserName,
          initiatedByUserEmail: params.initiatedByUserEmail,
          provider: params.provider,
          model: params.model,
        }),
        rejectAfterTimeout(TASK_EXECUTION_TIMEOUT_MS),
      ]);
    } catch (error) {
      // executeTaskPrompt has its own try/catch, so this only fires for
      // unexpected failures (e.g. getDb() failing, or the execution timeout).
      // Mark the task as failed so the UI doesn't show it stuck in "running"
      // forever.
      try {
        await markTaskFailed({
          db: getDb(this.env),
          taskId: params.taskId,
          message: getErrorMessage(error),
        });
      } catch {}
    }
  }
}

function rejectAfterTimeout(ms: number): Promise<never> {
  return new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Task execution timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
  });
}

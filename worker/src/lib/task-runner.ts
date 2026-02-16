import { DurableObject } from "cloudflare:workers";
import type { Sandbox } from "@cloudflare/sandbox";
import { getDb } from "../db/client";
import { executeTaskPrompt } from "./task-execution";
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

    const db = getDb(this.env);
    await executeTaskPrompt({
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
    });
  }
}

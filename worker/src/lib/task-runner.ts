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
}

export type CallbackContext = {
  token: string;
  taskId: string;
  organizationId: string;
  executionId: string;
  userId: string;
  provider: string;
  lastHeartbeat: number;
};

/** How often the watchdog alarm fires to check sandbox health. */
const WATCHDOG_INTERVAL_MS = 2 * 60 * 1000;

/** If no heartbeat received within this period, mark the task as failed. */
const HEARTBEAT_STALE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Durable Object that manages task execution lifecycle.
 *
 * Phase 1 — Setup (alarm with "params"):
 *   Sets up the sandbox, starts the autonomous task-runner script, then
 *   transitions to the watchdog phase.
 *
 * Phase 2 — Watchdog (alarm with "callback"):
 *   Periodically checks that the sandbox is still sending heartbeats.
 *   Marks the task as failed if heartbeats go stale.
 *
 * The sandbox calls back via internal API endpoints which invoke
 * recordHeartbeat(), verifyToken(), and clearCallback() on this DO.
 */
export class TaskRunner extends DurableObject<TaskRunnerEnv> {
  /** Store task params and schedule an immediate alarm to execute. */
  async schedule(params: TaskRunParams): Promise<void> {
    await this.ctx.storage.put("params", params);
    await this.ctx.storage.setAlarm(Date.now() + 1);
  }

  override async alarm(): Promise<void> {
    // Phase 1: Initial task setup + fire-and-forget.
    const params = await this.ctx.storage.get<TaskRunParams>("params");
    if (params) {
      await this.ctx.storage.delete("params");
      await this.handleTaskSetup(params);
      return;
    }

    // Phase 2: Watchdog — check sandbox heartbeat.
    const callback = await this.ctx.storage.get<CallbackContext>("callback");
    if (callback) {
      await this.handleWatchdog(callback);
      return;
    }

    // No params and no callback — nothing to do.
  }

  /**
   * Verify a callback token and return the execution context.
   * Called by internal API endpoints before performing DB writes.
   */
  async verifyToken(
    token: string,
  ): Promise<Omit<CallbackContext, "token" | "lastHeartbeat"> | null> {
    const callback = await this.ctx.storage.get<CallbackContext>("callback");
    if (!callback || callback.token !== token) {
      return null;
    }

    return {
      taskId: callback.taskId,
      organizationId: callback.organizationId,
      executionId: callback.executionId,
      userId: callback.userId,
      provider: callback.provider,
    };
  }

  /**
   * Record a heartbeat from the sandbox. Returns false if the token is invalid.
   */
  async recordHeartbeat(token: string): Promise<boolean> {
    const callback = await this.ctx.storage.get<CallbackContext>("callback");
    if (!callback || callback.token !== token) {
      return false;
    }

    callback.lastHeartbeat = Date.now();
    await this.ctx.storage.put("callback", callback);
    return true;
  }

  /**
   * Clear callback state after task completion or failure.
   * This stops the watchdog alarm from firing.
   */
  async clearCallback(): Promise<void> {
    await this.ctx.storage.delete("callback");
    await this.ctx.storage.deleteAlarm();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async handleTaskSetup(params: TaskRunParams): Promise<void> {
    try {
      const db = getDb(this.env);
      const callbackToken = await executeTaskPrompt({
        db,
        env: this.env,
        workerOrigin: params.workerOrigin,
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

      // Store callback context and start watchdog.
      await this.ctx.storage.put<CallbackContext>("callback", {
        token: callbackToken,
        taskId: params.taskId,
        organizationId: params.organizationId,
        executionId: params.executionId,
        userId: params.initiatedByUserId,
        provider: params.provider,
        lastHeartbeat: Date.now(),
      });

      await this.ctx.storage.setAlarm(Date.now() + WATCHDOG_INTERVAL_MS);
    } catch (error) {
      try {
        await markTaskFailed({
          db: getDb(this.env),
          taskId: params.taskId,
          message: getErrorMessage(error),
        });
      } catch {}
    }
  }

  private async handleWatchdog(callback: CallbackContext): Promise<void> {
    const timeSinceHeartbeat = Date.now() - callback.lastHeartbeat;

    if (timeSinceHeartbeat > HEARTBEAT_STALE_THRESHOLD_MS) {
      console.error("Sandbox heartbeat stale, marking task as failed", {
        executionId: callback.executionId,
        taskId: callback.taskId,
        timeSinceHeartbeat,
      });

      try {
        await markTaskFailed({
          db: getDb(this.env),
          taskId: callback.taskId,
          message: `Task execution stalled — no heartbeat received for ${Math.round(timeSinceHeartbeat / 1000)}s`,
        });
      } catch {}

      await this.ctx.storage.delete("callback");
      return;
    }

    // Sandbox is still alive — check again later.
    await this.ctx.storage.setAlarm(Date.now() + WATCHDOG_INTERVAL_MS);
  }
}

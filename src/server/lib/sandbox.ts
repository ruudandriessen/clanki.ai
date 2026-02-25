import { setTimeout as sleep } from "node:timers/promises";
import { createOpencodeClient, OpencodeClient, type Config } from "@opencode-ai/sdk";
import { Sandbox as VercelSandbox } from "@vercel/sandbox";
// oxlint-disable-next-line import/default
import taskRunnerSource from "../../../sandbox/task-runner.mjs?raw";

const SANDBOX_TIMEOUT_MS_DEFAULT = 15 * 60 * 1000;
const OPENCODE_PORT = 4096;
const TASK_RUNNER_PATH = "/vercel/sandbox/task-runner.mjs";

type ExecOptions = {
  cwd?: string;
};

type ExecResult = {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type TaskSandbox = {
  readonly sandboxId: string;
  setEnvVars(vars: Record<string, string>): Promise<void>;
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;
  execDetached(command: string, options?: ExecOptions): Promise<void>;
  exists(path: string): Promise<{ exists: boolean }>;
  readFile(path: string): Promise<{ content: string }>;
  gitCheckout(repoUrl: string, options: { targetDir: string }): Promise<void>;
  domain(port: number): string;
  ensureOpencodeServer(config?: Config): Promise<void>;
};

export type SandboxEnv = {
  VERCEL_SANDBOX_TIMEOUT_MS?: string;
};

class VercelTaskSandbox implements TaskSandbox {
  readonly #sandbox: VercelSandbox;
  readonly #commandEnv: Record<string, string> = {};

  constructor(sandbox: VercelSandbox) {
    this.#sandbox = sandbox;
  }

  get sandboxId(): string {
    return this.#sandbox.sandboxId;
  }

  domain(port: number): string {
    return this.#sandbox.domain(port);
  }

  async setEnvVars(vars: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(vars)) {
      this.#commandEnv[key] = value;
    }
  }

  async exec(command: string, options?: ExecOptions): Promise<ExecResult> {
    const result = await this.#sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", command],
      cwd: options?.cwd,
      env: this.#commandEnv,
    });

    const [stdout, stderr] = await Promise.all([result.stdout(), result.stderr()]);

    return {
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      stdout,
      stderr,
    };
  }

  async execDetached(command: string, options?: ExecOptions): Promise<void> {
    await this.#sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", command],
      cwd: options?.cwd,
      env: this.#commandEnv,
      detached: true,
    });
  }

  async exists(path: string): Promise<{ exists: boolean }> {
    const result = await this.exec(`test -e ${shellQuote(path)}`);
    return { exists: result.success };
  }

  async readFile(path: string): Promise<{ content: string }> {
    const content = await this.#sandbox.readFileToBuffer({ path });
    if (!content) {
      throw new Error(`File not found: ${path}`);
    }

    return { content: content.toString("utf8") };
  }

  async gitCheckout(repoUrl: string, options: { targetDir: string }): Promise<void> {
    const result = await this.exec(
      `git clone --depth=1 ${shellQuote(repoUrl)} ${shellQuote(options.targetDir)}`,
    );

    if (!result.success) {
      throw new Error(
        `Failed to clone repository (exit code ${result.exitCode}): ${result.stderr || result.stdout}`,
      );
    }
  }

  async ensureOpencodeServer(config?: Config): Promise<void> {
    const ready = await this.#isOpencodeReady();
    if (ready) {
      return;
    }

    await this.#sandbox.runCommand({
      cmd: "opencode",
      args: ["serve", "--hostname=0.0.0.0", "--port", String(OPENCODE_PORT)],
      env: {
        ...this.#commandEnv,
        OPENCODE_CONFIG_CONTENT: JSON.stringify(config ?? {}),
      },
      detached: true,
    });

    await this.#waitForOpencodeReady();
  }

  async ensureBaseTooling(): Promise<void> {
    await this.#ensureTaskRunnerScript();

    const opencodeCheck = await this.exec("command -v opencode >/dev/null 2>&1");
    if (!opencodeCheck.success) {
      const install = await this.exec("npm install -g opencode-ai");
      if (!install.success) {
        throw new Error(
          `Failed to install opencode-ai: ${install.stderr || install.stdout || "unknown error"}`,
        );
      }
    }

    const ghCheck = await this.exec("command -v gh >/dev/null 2>&1");
    if (!ghCheck.success) {
      const install = await this.#sandbox.runCommand({
        cmd: "dnf",
        args: ["install", "-y", "gh"],
        sudo: true,
        env: this.#commandEnv,
      });

      if (install.exitCode !== 0) {
        const [stdout, stderr] = await Promise.all([install.stdout(), install.stderr()]);
        console.warn("Failed to install gh in sandbox", { stderr: stderr || stdout });
      }
    }
  }

  async #ensureTaskRunnerScript(): Promise<void> {
    await this.#sandbox.writeFiles([
      {
        path: TASK_RUNNER_PATH,
        content: Buffer.from(taskRunnerSource, "utf8"),
      },
    ]);

    const chmod = await this.exec(`chmod +x ${shellQuote(TASK_RUNNER_PATH)}`);
    if (!chmod.success) {
      throw new Error(`Failed to chmod task runner script: ${chmod.stderr || chmod.stdout}`);
    }
  }

  async #isOpencodeReady(): Promise<boolean> {
    try {
      const response = await fetch(`${this.domain(OPENCODE_PORT)}/session/status`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async #waitForOpencodeReady(): Promise<void> {
    for (let attempt = 0; attempt < 30; attempt++) {
      if (await this.#isOpencodeReady()) {
        return;
      }
      await sleep(500);
    }

    throw new Error("Timed out waiting for opencode server to become ready");
  }
}

/** Get or create a sandbox for a given id. */
export async function getTaskSandbox(
  env: SandboxEnv,
  sandboxId?: string | null,
): Promise<TaskSandbox> {
  let sandbox: VercelSandbox | null = null;
  const normalizedSandboxId = sandboxId?.trim() ?? "";

  if (normalizedSandboxId.length > 0) {
    try {
      const existing = await VercelSandbox.get({
        sandboxId: normalizedSandboxId,
      });
      if (existing.status === "running" || existing.status === "pending") {
        sandbox = existing;
      }
    } catch {
      sandbox = null;
    }
  }

  if (!sandbox) {
    sandbox = await VercelSandbox.create({
      ports: [OPENCODE_PORT],
      runtime: "node24",
      timeout: resolveSandboxTimeout(env),
    });
  }

  const client = new VercelTaskSandbox(sandbox);
  await client.ensureBaseTooling();
  return client;
}

/** Start (or connect to) the OpenCode server inside the sandbox and return a typed client. */
export async function getOpenCodeClient(sandbox: TaskSandbox, directory: string, config?: Config) {
  const mergedConfig: Config = {
    ...config,
    permission: {
      ...config?.permission,
      external_directory: "deny",
    },
  };

  await sandbox.ensureOpencodeServer(mergedConfig);

  return {
    client: createOpencodeClient({
      baseUrl: sandbox.domain(OPENCODE_PORT),
      directory,
    }) as OpencodeClient,
  };
}

function resolveSandboxTimeout(env: SandboxEnv): number {
  const configured = env.VERCEL_SANDBOX_TIMEOUT_MS;
  if (!configured) {
    return SANDBOX_TIMEOUT_MS_DEFAULT;
  }

  const parsed = Number(configured);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return SANDBOX_TIMEOUT_MS_DEFAULT;
  }

  return Math.trunc(parsed);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `"'"'`)}'`;
}

export const TASK_RUNNER_COMMAND = `node ${TASK_RUNNER_PATH}`;

import { setTimeout as sleep } from "node:timers/promises";
import { createOpencodeClient, OpencodeClient, type Config } from "@opencode-ai/sdk";
import { Sandbox as VercelSandbox } from "@vercel/sandbox";
// oxlint-disable-next-line import/default
import taskRunnerSource from "../../../sandbox/task-runner.mjs?raw";

const SANDBOX_TIMEOUT_MS_DEFAULT = 15 * 60 * 1000;
const OPENCODE_PORT = 4096;
const TASK_RUNNER_PATH = "/vercel/sandbox/task-runner.mjs";
const GITHUB_CLI_INSTALL_SCRIPT = `
set -euo pipefail

if command -v curl >/dev/null 2>&1; then
  fetch_text() { curl -fsSL "$1"; }
  fetch_file() { curl -fsSL "$1" -o "$2"; }
elif command -v wget >/dev/null 2>&1; then
  fetch_text() { wget -qO- "$1"; }
  fetch_file() { wget -qO "$2" "$1"; }
else
  echo "Neither curl nor wget is available" >&2
  exit 1
fi

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) GH_ARCH="amd64" ;;
  aarch64|arm64) GH_ARCH="arm64" ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

RELEASE_JSON="$(fetch_text https://api.github.com/repos/cli/cli/releases/latest)"
VERSION="$(printf "%s" "$RELEASE_JSON" | grep -m1 '"tag_name"' | sed -E 's/.*"tag_name":[[:space:]]*"v?([^"]+)".*/\\1/')"
if [ -z "$VERSION" ]; then
  echo "Unable to resolve latest gh release version" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
ARCHIVE="gh_\${VERSION}_linux_\${GH_ARCH}.tar.gz"
DOWNLOAD_URL="https://github.com/cli/cli/releases/download/v\${VERSION}/\${ARCHIVE}"

fetch_file "$DOWNLOAD_URL" "$TMP_DIR/gh.tgz"
tar -xzf "$TMP_DIR/gh.tgz" -C "$TMP_DIR"

if [ -w /usr/local/bin ]; then
  INSTALL_DIR="/usr/local/bin"
else
  INSTALL_DIR="$HOME/.local/bin"
  mkdir -p "$INSTALL_DIR"
fi

SOURCE_BINARY="$TMP_DIR/gh_\${VERSION}_linux_\${GH_ARCH}/bin/gh"
if command -v install >/dev/null 2>&1; then
  install -m 0755 "$SOURCE_BINARY" "$INSTALL_DIR/gh"
else
  cp "$SOURCE_BINARY" "$INSTALL_DIR/gh"
  chmod 0755 "$INSTALL_DIR/gh"
fi

printf "%s" "$INSTALL_DIR"
`;

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
    await this.#ensureBun();

    if (!(await this.#commandExists("opencode"))) {
      const install = await this.exec("npm install -g opencode-ai");
      if (!install.success) {
        throw new Error(
          `Failed to install opencode-ai: ${install.stderr || install.stdout || "unknown error"}`,
        );
      }
    }

    await this.#ensureGithubCli();
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
      if (!response.ok) {
        return false;
      }

      const body = (await response.text()).trim();
      if (body.length === 0) {
        return false;
      }

      const parsed = JSON.parse(body) as unknown;
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
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

  async #commandExists(command: string): Promise<boolean> {
    const check = await this.exec(`command -v ${command} >/dev/null 2>&1`);
    return check.success;
  }

  async #ensureBun(): Promise<void> {
    if (await this.#commandExists("bun")) {
      return;
    }

    const homeDirectory = await this.#resolveHomeDirectory();
    const bunInstallDirectory = `${homeDirectory}/.bun`;
    const bunBinDirectory = `${bunInstallDirectory}/bin`;

    const install = await this.exec(
      [
        `export BUN_INSTALL=${shellQuote(bunInstallDirectory)}`,
        'export PATH="$BUN_INSTALL/bin:$PATH"',
        "if ! command -v bun >/dev/null 2>&1; then curl -fsSL https://bun.sh/install | bash; fi",
      ].join(" && "),
    );

    if (!install.success) {
      throw new Error(
        `Failed to install Bun: ${install.stderr || install.stdout || "unknown error"}`,
      );
    }

    this.#commandEnv.BUN_INSTALL = bunInstallDirectory;
    await this.#prependPath(bunBinDirectory);

    if (!(await this.#commandExists("bun"))) {
      throw new Error("Bun is still unavailable after installation");
    }
  }

  async #resolveHomeDirectory(): Promise<string> {
    const homeResult = await this.exec("printf '%s' \"$HOME\"");
    const homeDirectory = homeResult.stdout.trim();
    return homeDirectory.length > 0 ? homeDirectory : "/root";
  }

  async #ensureGithubCli(): Promise<void> {
    if (await this.#commandExists("gh")) {
      return;
    }

    const installErrors: string[] = [];

    if (await this.#commandExists("dnf")) {
      const dnfInstall = await this.#sandbox.runCommand({
        cmd: "dnf",
        args: ["install", "-y", "gh"],
        sudo: true,
        env: this.#commandEnv,
      });
      if (dnfInstall.exitCode !== 0) {
        const [stdout, stderr] = await Promise.all([dnfInstall.stdout(), dnfInstall.stderr()]);
        const output = stderr.trim().length > 0 ? stderr : stdout;
        const message = normalizeCommandFailureMessage(output);
        if (message) {
          installErrors.push(`dnf: ${message}`);
        }
      }
    }

    if (await this.#commandExists("gh")) {
      return;
    }

    const installFromRelease = await this.exec(GITHUB_CLI_INSTALL_SCRIPT);
    if (installFromRelease.success) {
      const installDirectory = installFromRelease.stdout.trim();
      if (installDirectory.length > 0) {
        await this.#prependPath(installDirectory);
      }
    } else {
      const output =
        installFromRelease.stderr.trim().length > 0
          ? installFromRelease.stderr
          : installFromRelease.stdout;
      const message = normalizeCommandFailureMessage(output);
      if (message) {
        installErrors.push(`release: ${message}`);
      }
    }

    if (await this.#commandExists("gh")) {
      return;
    }

    const combinedError = installErrors.join(" | ");
    console.warn("Failed to install gh in sandbox", {
      stderr: combinedError.length > 0 ? combinedError : "unknown error",
    });
  }

  async #prependPath(pathEntry: string): Promise<void> {
    const currentPath = (await this.exec("printf '%s' \"$PATH\"")).stdout.trim();

    if (currentPath.length === 0) {
      this.#commandEnv.PATH = pathEntry;
      return;
    }

    const segments = currentPath.split(":");
    this.#commandEnv.PATH = segments.includes(pathEntry)
      ? currentPath
      : `${pathEntry}:${currentPath}`;
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

function normalizeCommandFailureMessage(value: string): string {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : "unknown error";
}

export const TASK_RUNNER_COMMAND = `node ${TASK_RUNNER_PATH}`;

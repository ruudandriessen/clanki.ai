import { createInstallationToken, buildAuthenticatedCloneUrl, type GitHubAppEnv } from "../github";
import type { TaskSandbox } from "../sandbox";
import { truncateCommandOutput } from "./helpers";

export async function setupGitToken(args: {
  env: GitHubAppEnv;
  sandbox: TaskSandbox;
  installationId: number | null;
}): Promise<string | null> {
  if (!args.installationId) {
    return null;
  }

  const token = await createInstallationToken(args.env, args.installationId);
  await args.sandbox.setEnvVars({ GITHUB_TOKEN: token });
  return token;
}

export async function setupGitIdentity(args: {
  sandbox: TaskSandbox;
  userId: string;
  userName: string;
  userEmail: string;
}): Promise<void> {
  const identity = resolveGitIdentity(args);
  const result = await args.sandbox.exec(
    [
      `git config --global user.name ${shellQuote(identity.name)}`,
      `git config --global user.email ${shellQuote(identity.email)}`,
    ].join(" && "),
  );

  if (!result.success) {
    throw new Error(
      formatGitConfigFailure({
        name: identity.name,
        email: identity.email,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      }),
    );
  }
}

export async function cloneRepository(args: {
  sandbox: TaskSandbox;
  repoUrl: string;
  repoDir: string;
  gitToken: string | null;
}): Promise<{ freshClone: boolean }> {
  const { sandbox, repoUrl, repoDir, gitToken } = args;
  const needsClone = !(await sandbox.exists(repoDir)).exists;

  if (needsClone) {
    const cloneUrl = gitToken ? buildAuthenticatedCloneUrl(repoUrl, gitToken) : repoUrl;
    await sandbox.gitCheckout(cloneUrl, { targetDir: repoDir });
  } else if (gitToken) {
    const freshUrl = buildAuthenticatedCloneUrl(repoUrl, gitToken);
    await sandbox.exec(`git -C ${repoDir} remote set-url origin '${freshUrl}'`);
  }

  return { freshClone: needsClone };
}

const SETUP_FINGERPRINT_PATH = "/vercel/sandbox/.clanki/setup-fingerprint-v1";

type RepositorySyncResult =
  | { status: "updated"; previousHead: string; currentHead: string }
  | { status: "up-to-date"; currentHead: string }
  | { status: "skipped"; reason: string };

type SetupDecision =
  | { shouldRun: true; reason: string; fingerprint: string }
  | { shouldRun: false; reason: string };

export async function syncRepositoryCheckout(args: {
  sandbox: TaskSandbox;
  repoDir: string;
}): Promise<RepositorySyncResult> {
  const preCheck = await args.sandbox.exec(buildSyncPreCheckCommand(args.repoDir));

  if (!preCheck.success) {
    return { status: "skipped", reason: "Repository sync pre-check failed" };
  }

  const preCheckStatus = preCheck.stdout.trim();
  if (preCheckStatus !== "ok") {
    return {
      status: "skipped",
      reason: describeSyncSkipReason(preCheckStatus),
    };
  }

  const beforeHeadResult = await args.sandbox.exec(
    `git -C ${shellQuote(args.repoDir)} rev-parse HEAD`,
  );
  if (!beforeHeadResult.success) {
    return { status: "skipped", reason: "Failed to resolve current commit" };
  }

  const beforeHead = beforeHeadResult.stdout.trim();
  const fetchResult = await args.sandbox.exec(
    `git -C ${shellQuote(args.repoDir)} fetch --prune origin`,
  );
  if (!fetchResult.success) {
    return { status: "skipped", reason: "Fetch from origin failed" };
  }

  const ffResult = await args.sandbox.exec(
    `git -C ${shellQuote(args.repoDir)} merge --ff-only @{u}`,
  );
  if (!ffResult.success) {
    return { status: "skipped", reason: "Fast-forward merge from upstream failed" };
  }

  const afterHeadResult = await args.sandbox.exec(
    `git -C ${shellQuote(args.repoDir)} rev-parse HEAD`,
  );
  if (!afterHeadResult.success) {
    return { status: "skipped", reason: "Failed to resolve synced commit" };
  }

  const afterHead = afterHeadResult.stdout.trim();
  if (afterHead !== beforeHead) {
    return {
      status: "updated",
      previousHead: beforeHead,
      currentHead: afterHead,
    };
  }

  return { status: "up-to-date", currentHead: afterHead };
}

export async function decideSetupScriptRun(args: {
  sandbox: TaskSandbox;
  repoDir: string;
  command: string | null;
  freshClone: boolean;
}): Promise<SetupDecision> {
  const normalizedCommand = args.command?.trim() ?? "";
  if (normalizedCommand.length === 0) {
    return { shouldRun: false, reason: "No setup command configured" };
  }

  const fingerprint = await computeSetupFingerprint(args.sandbox, args.repoDir, normalizedCommand);
  if (fingerprint === null) {
    return { shouldRun: true, reason: "Unable to compute setup fingerprint", fingerprint: "" };
  }

  if (args.freshClone) {
    return { shouldRun: true, reason: "Fresh clone requires setup", fingerprint };
  }

  const cachedFingerprint = await readSetupFingerprint(args.sandbox);
  if (cachedFingerprint === fingerprint) {
    return {
      shouldRun: false,
      reason: "Setup inputs unchanged; reusing existing dependencies",
    };
  }

  return {
    shouldRun: true,
    reason: "Setup inputs changed",
    fingerprint,
  };
}

export async function persistSetupFingerprint(args: {
  sandbox: TaskSandbox;
  fingerprint: string;
}): Promise<void> {
  if (args.fingerprint.trim().length === 0) {
    return;
  }

  const result = await args.sandbox.exec(
    [
      "set -euo pipefail",
      `mkdir -p ${shellQuote(dirname(SETUP_FINGERPRINT_PATH))}`,
      `printf %s ${shellQuote(args.fingerprint)} > ${shellQuote(SETUP_FINGERPRINT_PATH)}`,
    ].join(" && "),
  );

  if (!result.success) {
    throw new Error("Failed to persist setup fingerprint");
  }
}

export async function runSetupScript(args: {
  sandbox: TaskSandbox;
  command: string | null;
  repoDir: string;
}): Promise<void> {
  const normalizedCommand = args.command?.trim() ?? "";
  if (normalizedCommand.length === 0) {
    return;
  }

  const commandNeedsBun = /\bbun\b/.test(normalizedCommand);
  const commandToRun = commandNeedsBun
    ? [buildBunPathCommand(), normalizedCommand].join(" && ")
    : normalizedCommand;

  if (commandNeedsBun) {
    const installBunResult = await args.sandbox.exec(buildInstallBunCommand(), {
      cwd: args.repoDir,
    });
    if (!installBunResult.success) {
      throw new Error(
        formatBunInstallFailure({
          exitCode: installBunResult.exitCode,
          stdout: installBunResult.stdout,
          stderr: installBunResult.stderr,
        }),
      );
    }
  }

  const result = await args.sandbox.exec(commandToRun, { cwd: args.repoDir });
  if (!result.success) {
    throw new Error(
      formatSetupCommandFailure({
        command: normalizedCommand,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildBunPathCommand(): string {
  return 'export BUN_INSTALL="$HOME/.bun" && export PATH="$BUN_INSTALL/bin:$PATH"';
}

function describeSyncSkipReason(status: string): string {
  switch (status) {
    case "missing":
      return "Repository directory is missing";
    case "not-git":
      return "Repository directory is not a git checkout";
    case "dirty":
      return "Repository has local changes";
    case "detached":
      return "Repository is in detached HEAD state";
    case "no-upstream":
      return "Current branch has no upstream configured";
    default:
      return "Repository sync pre-check failed";
  }
}

async function computeSetupFingerprint(
  sandbox: TaskSandbox,
  repoDir: string,
  command: string,
): Promise<string | null> {
  const result = await sandbox.exec(buildSetupFingerprintCommand(repoDir, command));

  if (!result.success) {
    return null;
  }

  const fingerprint = result.stdout.trim();
  return fingerprint.length > 0 ? fingerprint : null;
}

async function readSetupFingerprint(sandbox: TaskSandbox): Promise<string | null> {
  const fingerprintFile = await sandbox.exists(SETUP_FINGERPRINT_PATH);
  if (!fingerprintFile.exists) {
    return null;
  }

  try {
    const content = await sandbox.readFile(SETUP_FINGERPRINT_PATH);
    const fingerprint = content.content.trim();
    return fingerprint.length > 0 ? fingerprint : null;
  } catch {
    return null;
  }
}

function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx <= 0 ? "/" : path.slice(0, idx);
}

function buildSyncPreCheckCommand(repoDir: string): string {
  const quotedRepoDir = shellQuote(repoDir);
  return [
    "set -euo pipefail",
    `if [ ! -d ${quotedRepoDir} ]; then printf 'missing'; exit 0; fi`,
    `if ! git -C ${quotedRepoDir} rev-parse --is-inside-work-tree >/dev/null 2>&1; then printf 'not-git'; exit 0; fi`,
    `if [ -n "$(git -C ${quotedRepoDir} status --porcelain --untracked-files=normal)" ]; then printf 'dirty'; exit 0; fi`,
    `if [ "$(git -C ${quotedRepoDir} rev-parse --abbrev-ref HEAD)" = 'HEAD' ]; then printf 'detached'; exit 0; fi`,
    `if ! git -C ${quotedRepoDir} rev-parse --abbrev-ref --symbolic-full-name @{u} >/dev/null 2>&1; then printf 'no-upstream'; exit 0; fi`,
    "printf 'ok'",
  ].join("; ");
}

function buildSetupFingerprintCommand(repoDir: string, command: string): string {
  return [
    "set -euo pipefail",
    `cd ${shellQuote(repoDir)}`,
    `SETUP_COMMAND=${shellQuote(command)}`,
    "FILES='package.json package-lock.json npm-shrinkwrap.json pnpm-lock.yaml yarn.lock bun.lock bun.lockb .npmrc .yarnrc .yarnrc.yml pnpm-workspace.yaml'",
    '{ printf "command:%s\\n" "$SETUP_COMMAND"; printf "node:%s\\n" "$(node --version 2>/dev/null || true)"; printf "bun:%s\\n" "$(bun --version 2>/dev/null || true)"; for file in $FILES; do if [ -f "$file" ]; then printf "file:%s:%s\\n" "$file" "$(sha256sum "$file" | cut -d" " -f1)"; fi; done; } | sha256sum | cut -d" " -f1',
  ].join("; ");
}

function buildInstallBunCommand(): string {
  return [
    buildBunPathCommand(),
    "if ! command -v bun >/dev/null 2>&1; then curl -fsSL https://bun.sh/install | bash; fi",
  ].join(" && ");
}

function resolveGitIdentity(args: { userId: string; userName: string; userEmail: string }): {
  name: string;
  email: string;
} {
  const name = args.userName.trim().length > 0 ? args.userName.trim() : "Clanki User";
  const email =
    args.userEmail.trim().length > 0
      ? args.userEmail.trim()
      : `user+${args.userId.slice(0, 12)}@users.noreply.github.com`;
  return { name, email };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function formatGitConfigFailure(args: {
  name: string;
  email: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}): string {
  const stdout = truncateCommandOutput(args.stdout.trim());
  const stderr = truncateCommandOutput(args.stderr.trim());
  const output = [stderr, stdout].filter((part) => part.length > 0).join("\n\n");
  const base = `Failed to configure git identity (${args.name} <${args.email}>) (exit code ${args.exitCode})`;

  if (output.length === 0) {
    return base;
  }

  return `${base}\n${output}`;
}

function formatSetupCommandFailure(args: {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}): string {
  const stdout = truncateCommandOutput(args.stdout.trim());
  const stderr = truncateCommandOutput(args.stderr.trim());
  const output = [stderr, stdout].filter((part) => part.length > 0).join("\n\n");

  if (output.length === 0) {
    return `Project setup command failed (exit code ${args.exitCode}): ${args.command}`;
  }

  return `Project setup command failed (exit code ${args.exitCode}): ${args.command}\n${output}`;
}

function formatBunInstallFailure(args: {
  exitCode: number;
  stdout: string;
  stderr: string;
}): string {
  const stdout = truncateCommandOutput(args.stdout.trim());
  const stderr = truncateCommandOutput(args.stderr.trim());
  const output = [stderr, stdout].filter((part) => part.length > 0).join("\n\n");
  const base = `Failed to install Bun before running setup command (exit code ${args.exitCode})`;

  if (output.length === 0) {
    return base;
  }

  return `${base}\n${output}`;
}

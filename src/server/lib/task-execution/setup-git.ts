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

export async function runSetupScript(args: {
  sandbox: TaskSandbox;
  command: string | null;
  repoDir: string;
}): Promise<void> {
  const normalizedCommand = args.command?.trim() ?? "";
  if (normalizedCommand.length === 0) {
    return;
  }

  const result = await args.sandbox.exec(normalizedCommand, { cwd: args.repoDir });
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

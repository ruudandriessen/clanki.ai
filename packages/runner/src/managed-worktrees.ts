import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

function resolveRunnerRoot(): string {
  return join(homedir(), "clanki");
}

function parseRepoSlug(repoUrl: string): string {
  const normalized = repoUrl.trim().replace(/\/$/, "").replace(/\.git$/, "");
  let repoPath: string;

  if (normalized.startsWith("https://github.com/")) {
    repoPath = normalized.slice("https://github.com/".length);
  } else if (normalized.startsWith("git@github.com:")) {
    repoPath = normalized.slice("git@github.com:".length);
  } else if (normalized.startsWith("ssh://git@github.com/")) {
    repoPath = normalized.slice("ssh://git@github.com/".length).replace(/^\//, "");
  } else {
    repoPath = normalized;
  }

  const segments = repoPath.split("/").filter(Boolean);
  if (segments.length !== 2) {
    throw new Error(`Unsupported GitHub repository URL: ${repoUrl}`);
  }
  return `${segments[0]}/${segments[1]}`;
}

export function resolveRepoRoot(repoUrl: string): string {
  const slug = parseRepoSlug(repoUrl);
  const repoName = slug.split("/")[1];
  return join(resolveRunnerRoot(), repoName);
}

export function listWorktreeDirectories(repoRoot: string): string[] {
  if (!existsSync(repoRoot)) return [];

  const dirs: string[] = [];
  for (const entry of readdirSync(repoRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(repoRoot, entry.name);
    if (existsSync(join(path, ".git"))) {
      dirs.push(path);
    }
  }
  return dirs.sort();
}

function runCommand(program: string, args: string[]): string {
  const result = spawnSync(program, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw new Error(`Failed to run ${program}: ${result.error.message}`);
  if (result.status !== 0) {
    const details =
      result.stderr?.trim() || result.stdout?.trim() || `exit status ${result.status}`;
    throw new Error(`${program} failed: ${details}`);
  }
  return result.stdout || "";
}

function resolveDefaultBranch(defaultDirectory: string): string {
  const output = runCommand("git", [
    "-C",
    defaultDirectory,
    "symbolic-ref",
    "--short",
    "refs/remotes/origin/HEAD",
  ]).trim();
  const branch = output.startsWith("origin/") ? output.slice("origin/".length) : output;
  if (!branch) throw new Error(`Failed to resolve default branch for ${defaultDirectory}`);
  return branch;
}

function slugifyIdentifier(value: string): string {
  let slug = "";
  let lastWasSeparator = false;
  for (const char of value) {
    if (/[a-z0-9]/i.test(char)) {
      slug += char.toLowerCase();
      lastWasSeparator = false;
    } else if (!lastWasSeparator) {
      slug += "-";
      lastWasSeparator = true;
    }
  }
  return slug.replace(/^-+|-+$/g, "") || "session";
}

export function ensureDefaultCheckout(repoUrl: string, repoRoot: string): string {
  const defaultDirectory = join(repoRoot, "default");
  mkdirSync(repoRoot, { recursive: true });

  if (!existsSync(defaultDirectory)) {
    const slug = parseRepoSlug(repoUrl);
    runCommand("gh", ["repo", "clone", slug, defaultDirectory]);
  } else if (!existsSync(join(defaultDirectory, ".git"))) {
    throw new Error(`Managed checkout exists without git metadata: ${defaultDirectory}`);
  }

  runCommand("git", ["-C", defaultDirectory, "fetch", "origin", "--prune"]);
  const defaultBranch = resolveDefaultBranch(defaultDirectory);
  runCommand("git", ["-C", defaultDirectory, "checkout", defaultBranch]);
  runCommand("git", ["-C", defaultDirectory, "pull", "--ff-only", "origin", defaultBranch]);

  return defaultBranch;
}

export function prepareWorktree(
  repoUrl: string,
  title: string,
): { directory: string; defaultDirectory: string; branchName: string } {
  const repoRoot = resolveRepoRoot(repoUrl);
  const defaultBranch = ensureDefaultCheckout(repoUrl, repoRoot);
  const defaultDirectory = join(repoRoot, "default");
  const titleSlug = slugifyIdentifier(title);
  const timestamp = Math.floor(Date.now() / 1000);

  for (let attempt = 0; attempt < 100; attempt++) {
    const identifier =
      attempt === 0 ? `${timestamp}-${titleSlug}` : `${timestamp}-${titleSlug}-${attempt}`;
    const directory = join(repoRoot, identifier);
    if (!existsSync(directory)) {
      const branchName = `runner/${identifier}`;
      runCommand("git", [
        "-C",
        defaultDirectory,
        "worktree",
        "add",
        "-b",
        branchName,
        directory,
        defaultBranch,
      ]);
      return { directory, defaultDirectory, branchName };
    }
  }

  throw new Error(`Failed to allocate a unique worktree directory in ${repoRoot}`);
}

export function cleanupWorktree(
  defaultDirectory: string,
  directory: string,
  branchName: string,
): void {
  try {
    runCommand("git", ["-C", defaultDirectory, "worktree", "remove", "--force", directory]);
  } catch {}
  try {
    runCommand("git", ["-C", defaultDirectory, "branch", "-D", branchName]);
  } catch {}
}

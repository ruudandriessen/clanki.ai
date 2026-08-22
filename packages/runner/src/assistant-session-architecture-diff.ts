import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  analyzeProject,
  countDependencyGraphChanges,
  diffDependencyGraphs,
  selectChangedDependencyGraph,
  type DependencyGraph,
} from "@clanki/cli";
import type { ArchitectureDiff } from "@clanki/protocol";

const revisionGraphCache = new Map<string, DependencyGraph>();

export function getAssistantSessionArchitectureDiff(args: { directory: string }): ArchitectureDiff {
  const directory = path.resolve(args.directory);
  const defaultBranch = resolveDefaultBranch(directory);
  fetchDefaultBranch(directory, defaultBranch);

  const mergeBase = runGitCommand(
    directory,
    ["merge-base", `origin/${defaultBranch}`, "HEAD"],
    "Failed to resolve merge base for architecture diff",
  ).trim();

  if (mergeBase.length === 0) {
    throw new Error("Failed to resolve merge base for architecture diff");
  }

  const before = getRevisionGraph(directory, mergeBase);
  const after = analyzeWorkspaceGraph(directory);
  const diff = diffDependencyGraphs(before, after);
  const changed = selectChangedDependencyGraph(diff);
  const counts = countDependencyGraphChanges(diff);

  return {
    ...counts,
    edges: changed.edges,
    files: changed.files,
  };
}

function getRevisionGraph(directory: string, revision: string): DependencyGraph {
  const cacheKey = `${directory}:${revision}`;
  const cached = revisionGraphCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const graph = analyzeRevisionGraph(directory, revision);
  revisionGraphCache.set(cacheKey, graph);
  return graph;
}

function analyzeRevisionGraph(directory: string, revision: string): DependencyGraph {
  const worktreeDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "clanki-architecture-"));
  let worktreeAdded = false;

  try {
    runGitCommand(
      directory,
      ["worktree", "add", "--detach", worktreeDirectory, revision],
      `Failed to create a worktree for ${revision}`,
    );
    worktreeAdded = true;
    return analyzeWorkspaceGraph(worktreeDirectory);
  } finally {
    if (worktreeAdded) {
      runGitCommand(
        directory,
        ["worktree", "remove", "--force", worktreeDirectory],
        `Failed to remove the architecture worktree at ${worktreeDirectory}`,
      );
    } else {
      fs.rmSync(worktreeDirectory, { recursive: true, force: true });
    }
  }
}

function analyzeWorkspaceGraph(directory: string): DependencyGraph {
  return analyzeProject(resolveWorkspaceTsconfig(directory));
}

function resolveWorkspaceTsconfig(directory: string): string {
  const tsconfigPath = path.join(directory, "tsconfig.json");
  if (!fs.existsSync(tsconfigPath)) {
    throw new Error(`No tsconfig.json found in ${directory}`);
  }

  return tsconfigPath;
}

function fetchDefaultBranch(directory: string, defaultBranch: string): void {
  runGitCommand(
    directory,
    ["fetch", "origin", defaultBranch, "--prune"],
    `Failed to fetch origin/${defaultBranch} for architecture diff`,
  );
}

function resolveDefaultBranch(directory: string): string {
  const branch = runGitCommand(
    directory,
    ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    "Failed to resolve default branch for architecture diff",
  )
    .trim()
    .replace(/^origin\//u, "");

  if (branch.length === 0) {
    throw new Error("Failed to resolve default branch for architecture diff");
  }

  return branch;
}

function runGitCommand(directory: string, args: string[], errorContext: string): string {
  const output = spawnSync("git", ["-C", directory, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (output.error) {
    throw new Error(`${errorContext}: ${output.error.message}`);
  }

  if (output.status === 0) {
    return output.stdout;
  }

  const stderr = output.stderr.trim();
  const stdout = output.stdout.trim();
  throw new Error(`${errorContext}: ${stderr || stdout || `exit status ${output.status}`}`);
}

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type CreateWorkspaceArgs = {
    repoUrl: string;
    title: string;
};

type PreparedWorkspace = {
    defaultDirectory: string;
    directory: string;
};

type RepoWorkspacePaths = {
    defaultDirectory: string;
    repoRoot: string;
};

export function createWorkspace({ repoUrl, title }: CreateWorkspaceArgs): string {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
        throw new Error("title is required");
    }

    return prepareSessionWorktree(repoUrl, trimmedTitle).directory;
}

export function deleteWorkspace(workspaceDirectory: string): void {
    const managedWorkspaceDirectory = resolveManagedWorkspaceDirectory(workspaceDirectory);
    const defaultDirectory = resolveRepoDefaultDirectory(managedWorkspaceDirectory);

    if (!fs.existsSync(managedWorkspaceDirectory)) {
        return;
    }

    if (!fs.existsSync(defaultDirectory)) {
        fs.rmSync(managedWorkspaceDirectory, { force: true, recursive: true });
        return;
    }

    runCommand(
        "git",
        ["-C", defaultDirectory, "worktree", "remove", "--force", managedWorkspaceDirectory],
        `Failed to remove the worktree at ${managedWorkspaceDirectory}`,
    );
}

function prepareSessionWorktree(repoUrl: string, title: string): PreparedWorkspace {
    const workspace = resolveRepoWorkspacePaths(repoUrl);
    const defaultBranch = ensureDefaultCheckout(repoUrl, workspace);
    const identifier = nextWorktreeIdentifier(workspace.repoRoot, title);
    const directory = path.join(workspace.repoRoot, identifier);

    runCommand(
        "git",
        [
            "-C",
            workspace.defaultDirectory,
            "worktree",
            "add",
            "--detach",
            directory,
            `origin/${defaultBranch}`,
        ],
        `Failed to create a worktree at ${directory}`,
    );

    return {
        defaultDirectory: workspace.defaultDirectory,
        directory,
    };
}

function ensureDefaultCheckout(repoUrl: string, workspace: RepoWorkspacePaths): string {
    fs.mkdirSync(workspace.repoRoot, { recursive: true });

    if (!fs.existsSync(workspace.defaultDirectory)) {
        cloneDefaultCheckout(repoUrl, workspace.defaultDirectory);
    } else if (!fs.existsSync(path.join(workspace.defaultDirectory, ".git"))) {
        throw new Error(
            `Managed checkout exists without git metadata: ${workspace.defaultDirectory}`,
        );
    }

    runCommand(
        "git",
        ["-C", workspace.defaultDirectory, "fetch", "origin", "--prune"],
        `Failed to fetch the default checkout in ${workspace.defaultDirectory}`,
    );

    const defaultBranch = resolveDefaultBranch(workspace.defaultDirectory);

    runCommand(
        "git",
        ["-C", workspace.defaultDirectory, "checkout", defaultBranch],
        `Failed to checkout ${defaultBranch} in ${workspace.defaultDirectory}`,
    );

    runCommand(
        "git",
        ["-C", workspace.defaultDirectory, "pull", "--ff-only", "origin", defaultBranch],
        `Failed to fast-forward ${defaultBranch} in ${workspace.defaultDirectory}`,
    );

    return defaultBranch;
}

function cloneDefaultCheckout(repoUrl: string, defaultDirectory: string): void {
    fs.mkdirSync(path.dirname(defaultDirectory), { recursive: true });

    const repoSlug = parseRepoSlug(repoUrl);
    runCommand(
        "gh",
        ["repo", "clone", repoSlug, defaultDirectory],
        `Failed to clone ${repoSlug} into ${defaultDirectory}`,
    );
}

function resolveDefaultBranch(defaultDirectory: string): string {
    const reference = runCommand(
        "git",
        ["-C", defaultDirectory, "symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
        `Failed to resolve the default branch for ${defaultDirectory}`,
    )
        .trim()
        .replace(/^origin\//u, "");

    if (!reference) {
        throw new Error(`Failed to resolve the default branch for ${defaultDirectory}`);
    }

    return reference;
}

function nextWorktreeIdentifier(repoRoot: string, title: string): string {
    const titleSlug = slugifyIdentifier(title);
    const timestamp = Math.floor(Date.now() / 1_000);

    for (let attempt = 0; attempt < 100; attempt += 1) {
        const identifier =
            attempt === 0 ? `${timestamp}-${titleSlug}` : `${timestamp}-${titleSlug}-${attempt}`;

        if (!fs.existsSync(path.join(repoRoot, identifier))) {
            return identifier;
        }
    }

    throw new Error(`Failed to allocate a unique worktree directory in ${repoRoot}`);
}

function slugifyIdentifier(value: string): string {
    let slug = "";
    let lastWasSeparator = false;

    for (const character of value) {
        if (/[a-z0-9]/iu.test(character)) {
            slug += character.toLowerCase();
            lastWasSeparator = false;
            continue;
        }

        if (!lastWasSeparator) {
            slug += "-";
            lastWasSeparator = true;
        }
    }

    const trimmed = slug.replace(/^-+|-+$/gu, "");
    return trimmed || "session";
}

function resolveRepoWorkspacePaths(repoUrl: string): RepoWorkspacePaths {
    const repoName = parseRepoName(repoUrl);
    const repoRoot = path.join(resolveRunnerRoot(), repoName);

    return {
        defaultDirectory: path.join(repoRoot, "default"),
        repoRoot,
    };
}

function resolveRunnerRoot(): string {
    return path.join(os.homedir(), "clanki");
}

function resolveManagedWorkspaceDirectory(workspaceDirectory: string): string {
    const resolvedWorkspaceDirectory = path.resolve(workspaceDirectory);
    const runnerRoot = resolveRunnerRoot();
    const relativePath = path.relative(runnerRoot, resolvedWorkspaceDirectory);

    if (
        relativePath.startsWith("..") ||
        path.isAbsolute(relativePath) ||
        relativePath.length === 0 ||
        path.basename(resolvedWorkspaceDirectory) === "default"
    ) {
        throw new Error(`Refusing to remove unmanaged workspace: ${workspaceDirectory}`);
    }

    return resolvedWorkspaceDirectory;
}

function resolveRepoDefaultDirectory(workspaceDirectory: string): string {
    return path.join(path.dirname(workspaceDirectory), "default");
}

function parseRepoSlug(repoUrl: string): string {
    const normalized = normalizeRepoReference(repoUrl);
    let repoPath = normalized;

    if (repoPath.startsWith("https://github.com/")) {
        repoPath = repoPath.slice("https://github.com/".length);
    } else if (repoPath.startsWith("git@github.com:")) {
        repoPath = repoPath.slice("git@github.com:".length);
    } else if (repoPath.startsWith("ssh://git@github.com/")) {
        repoPath = repoPath.slice("ssh://git@github.com/".length);
    }

    const segments = repoPath.split("/").filter(Boolean);
    if (segments.length !== 2) {
        throw new Error(`Unsupported GitHub repository URL: ${repoUrl}`);
    }

    return `${segments[0]}/${segments[1]}`;
}

function parseRepoName(repoUrl: string): string {
    const repoSlug = parseRepoSlug(repoUrl);
    const repoName = repoSlug.split("/")[1];

    if (!repoName) {
        throw new Error(`Unsupported GitHub repository URL: ${repoUrl}`);
    }

    return repoName;
}

function normalizeRepoReference(repoUrl: string): string {
    return repoUrl
        .trim()
        .replace(/\/+$/u, "")
        .replace(/\.git$/u, "");
}

function runCommand(program: string, args: string[], errorContext?: string): string {
    const output = spawnSync(program, args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });

    if (output.error) {
        const message = errorContext
            ? `${errorContext}: ${output.error.message}`
            : `Failed to run ${program}: ${output.error.message}`;
        throw new Error(message);
    }

    if (output.status === 0) {
        return output.stdout;
    }

    const stderr = output.stderr.trim();
    const stdout = output.stdout.trim();
    const details = stderr || stdout || `exit status ${output.status}`;

    if (errorContext) {
        throw new Error(`${errorContext}: ${details}`);
    }

    throw new Error(`Command ${program} failed: ${details}`);
}

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { FileDiff } from "@opencode-ai/sdk";

export async function getAssistantSessionDiff(args: {
    directory: string;
    messageId?: string;
    sessionId: string;
}): Promise<FileDiff[]> {
    void args.messageId;
    void args.sessionId;

    const directory = path.resolve(args.directory);
    const defaultBranch = resolveDefaultBranch(directory);
    fetchDefaultBranch(directory, defaultBranch);

    const mergeBase = runGitCommand(
        directory,
        ["merge-base", `origin/${defaultBranch}`, "HEAD"],
        "Failed to resolve merge base for workspace diff",
    ).trim();

    if (mergeBase.length === 0) {
        throw new Error("Failed to resolve merge base for workspace diff");
    }

    const changedFiles = listChangedFiles(directory, mergeBase);

    return changedFiles.map((file) => {
        const stats = readDiffStats(directory, mergeBase, file);

        return {
            additions: stats.additions,
            after: readWorkingTreeFile(directory, file),
            before: readGitFile(directory, mergeBase, file),
            deletions: stats.deletions,
            file,
        };
    });
}

function fetchDefaultBranch(directory: string, defaultBranch: string): void {
    runGitCommand(
        directory,
        ["fetch", "origin", defaultBranch, "--prune"],
        `Failed to fetch origin/${defaultBranch} for workspace diff`,
    );
}

function listChangedFiles(directory: string, mergeBase: string): string[] {
    const output = runGitCommand(
        directory,
        ["diff", "--name-only", "--no-renames", mergeBase, "--"],
        "Failed to list workspace diff files",
    );

    return output
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}

function readGitFile(directory: string, revision: string, file: string): string {
    const output = spawnSync("git", ["-C", directory, "show", `${revision}:${file}`], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });

    if (output.status === 0) {
        return output.stdout;
    }

    const stderr = output.stderr.trim();
    if (stderr.includes("exists on disk, but not in") || stderr.includes("does not exist in")) {
        return "";
    }

    throw new Error(stderr || `Failed to read ${file} from ${revision}`);
}

function readDiffStats(
    directory: string,
    mergeBase: string,
    file: string,
): { additions: number; deletions: number } {
    const output = runGitCommand(
        directory,
        ["diff", "--numstat", "--no-renames", mergeBase, "--", file],
        `Failed to read diff stats for ${file}`,
    ).trim();

    const [additionsRaw = "0", deletionsRaw = "0"] = output.split("\t");

    return {
        additions: Number.parseInt(additionsRaw, 10) || 0,
        deletions: Number.parseInt(deletionsRaw, 10) || 0,
    };
}

function readWorkingTreeFile(directory: string, file: string): string {
    const absolutePath = path.join(directory, file);
    if (!fs.existsSync(absolutePath)) {
        return "";
    }

    return fs.readFileSync(absolutePath, "utf8");
}

function resolveDefaultBranch(directory: string): string {
    const branch = runGitCommand(
        directory,
        ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
        "Failed to resolve default branch for workspace diff",
    )
        .trim()
        .replace(/^origin\//u, "");

    if (branch.length === 0) {
        throw new Error("Failed to resolve default branch for workspace diff");
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

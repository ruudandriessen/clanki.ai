const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const {
  attachProcessStderr,
  reserveLocalPort,
  resolveBunBinary,
  runCommand,
  stopChildProcess,
  waitForPort,
} = require("./node-utils.cjs");

const DEFAULT_OPENCODE_MODEL = "gpt-5.3-codex";
const DEFAULT_OPENCODE_PROVIDER = "openai";

function createDesktopRunnerController({ workspaceRoot }) {
  let runnerProcess = null;

  async function ensureRunnerConnection(repoUrl) {
    const runner = await ensureRunner();
    const workspace = resolveRepoWorkspacePaths(repoUrl);
    const sessions = await listRepoSessions(runner, workspace.repoRoot);

    return {
      sessions,
      workspaceDirectory: workspace.repoRoot,
    };
  }

  async function createRunnerSession({ repoUrl, title }) {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      throw new Error("title is required");
    }

    const runner = await ensureRunner();
    const worktree = prepareSessionWorktree(repoUrl, trimmedTitle);

    try {
      const payload = await postRunnerJson(`${runner.baseUrl}/assistant/session/ensure`, {
        directory: worktree.directory,
        model: DEFAULT_OPENCODE_MODEL,
        provider: DEFAULT_OPENCODE_PROVIDER,
        taskTitle: trimmedTitle,
      });

      return {
        runnerType: "local-worktree",
        sessionId: payload.sessionId,
        workspaceDirectory: worktree.directory,
      };
    } catch (error) {
      cleanupFailedWorktree(worktree);
      throw error;
    }
  }

  async function promptRunnerTask(args) {
    const runner = await ensureRunner();
    const payload = await postRunnerJson(`${runner.baseUrl}/assistant/session/task-prompt`, {
      directory: args.directory,
      prompt: args.prompt,
      sessionId: args.sessionId,
      taskRun: {
        backendBaseUrl: args.backendBaseUrl,
        callbackToken: args.callbackToken,
        executionId: args.executionId,
      },
    });

    if (!payload.ok) {
      throw new Error("Local runner task prompt did not complete successfully");
    }
  }

  async function stop() {
    if (!runnerProcess) {
      return;
    }

    const child = runnerProcess.child;
    runnerProcess = null;
    await stopChildProcess(child);
  }

  async function ensureRunner() {
    if (runnerProcess && (await isRunnerHealthy(runnerProcess.baseUrl))) {
      return runnerProcess;
    }

    await stop();
    return await startRunner();
  }

  async function startRunner() {
    const runnerEntry = path.join(workspaceRoot, "packages/runner/src/cli.ts");
    if (!fs.existsSync(runnerEntry)) {
      throw new Error(`Runner entry not found at ${runnerEntry}`);
    }

    const port = await reserveLocalPort();
    const child = spawn(
      resolveBunBinary(),
      [runnerEntry, "--host", "127.0.0.1", "--port", String(port)],
      {
        cwd: workspaceRoot,
        stdio: ["ignore", "ignore", "pipe"],
      },
    );

    attachProcessStderr(child);

    let childError = null;
    child.once("error", (error) => {
      childError = error;
    });

    await waitForPort(port, {
      check() {
        if (childError) {
          throw new Error(`Failed to start the local runner: ${childError.message}`);
        }

        if (child.exitCode !== null) {
          throw new Error(`The local runner exited with code ${child.exitCode}`);
        }
      },
    });

    runnerProcess = {
      baseUrl: `http://127.0.0.1:${port}`,
      child,
    };

    return runnerProcess;
  }

  return {
    createRunnerSession,
    ensureRunnerConnection,
    promptRunnerTask,
    stop,
  };
}

async function listRepoSessions(runner, repoRoot) {
  const workspaceDirectories = listWorkspaceDirectories(repoRoot);
  const sessions = [];
  const seenSessionIds = new Set();

  for (const directory of workspaceDirectories) {
    const url = new URL("/assistant/sessions", runner.baseUrl);
    url.searchParams.set("directory", directory);
    const payload = await getRunnerJson(url.toString());

    for (const session of payload.sessions) {
      if (seenSessionIds.has(session.id)) {
        continue;
      }

      seenSessionIds.add(session.id);
      sessions.push(session);
    }
  }

  sessions.sort((left, right) => {
    if (right.updatedAt !== left.updatedAt) {
      return right.updatedAt - left.updatedAt;
    }

    return right.createdAt - left.createdAt;
  });

  return sessions;
}

function listWorkspaceDirectories(repoRoot) {
  if (!fs.existsSync(repoRoot)) {
    return [];
  }

  return fs
    .readdirSync(repoRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(repoRoot, entry.name))
    .filter((directory) => fs.existsSync(path.join(directory, ".git")))
    .toSorted();
}

function prepareSessionWorktree(repoUrl, title) {
  const workspace = resolveRepoWorkspacePaths(repoUrl);
  const defaultBranch = ensureDefaultCheckout(repoUrl, workspace);
  const identifier = nextWorktreeIdentifier(workspace.repoRoot, title);
  const directory = path.join(workspace.repoRoot, identifier);
  const branchName = `runner/${identifier}`;

  runCommand(
    "git",
    [
      "-C",
      workspace.defaultDirectory,
      "worktree",
      "add",
      "-b",
      branchName,
      directory,
      defaultBranch,
    ],
    `Failed to create a worktree at ${directory}`,
  );

  return {
    branchName,
    defaultDirectory: workspace.defaultDirectory,
    directory,
  };
}

function cleanupFailedWorktree(worktree) {
  try {
    runCommand(
      "git",
      ["-C", worktree.defaultDirectory, "worktree", "remove", "--force", worktree.directory],
      null,
    );
  } catch {}

  try {
    runCommand("git", ["-C", worktree.defaultDirectory, "branch", "-D", worktree.branchName], null);
  } catch {}
}

function ensureDefaultCheckout(repoUrl, workspace) {
  fs.mkdirSync(workspace.repoRoot, { recursive: true });

  if (!fs.existsSync(workspace.defaultDirectory)) {
    cloneDefaultCheckout(repoUrl, workspace.defaultDirectory);
  } else if (!fs.existsSync(path.join(workspace.defaultDirectory, ".git"))) {
    throw new Error(`Managed checkout exists without git metadata: ${workspace.defaultDirectory}`);
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

function cloneDefaultCheckout(repoUrl, defaultDirectory) {
  fs.mkdirSync(path.dirname(defaultDirectory), { recursive: true });

  const repoSlug = parseRepoSlug(repoUrl);
  runCommand(
    "gh",
    ["repo", "clone", repoSlug, defaultDirectory],
    `Failed to clone ${repoSlug} into ${defaultDirectory}`,
  );
}

function resolveDefaultBranch(defaultDirectory) {
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

function nextWorktreeIdentifier(repoRoot, title) {
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

function slugifyIdentifier(value) {
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

function resolveRepoWorkspacePaths(repoUrl) {
  const repoName = parseRepoName(repoUrl);
  const repoRoot = path.join(resolveRunnerRoot(), repoName);

  return {
    defaultDirectory: path.join(repoRoot, "default"),
    repoRoot,
  };
}

function resolveRunnerRoot() {
  return path.join(os.homedir(), "clanki");
}

function parseRepoSlug(repoUrl) {
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

function parseRepoName(repoUrl) {
  const repoSlug = parseRepoSlug(repoUrl);
  const repoName = repoSlug.split("/")[1];

  if (!repoName) {
    throw new Error(`Unsupported GitHub repository URL: ${repoUrl}`);
  }

  return repoName;
}

function normalizeRepoReference(repoUrl) {
  return repoUrl
    .trim()
    .replace(/\/+$/u, "")
    .replace(/\.git$/u, "");
}

async function isRunnerHealthy(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function getRunnerJson(url) {
  const response = await fetch(url);
  return await parseRunnerJson(response);
}

async function postRunnerJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return await parseRunnerJson(response);
}

async function parseRunnerJson(response) {
  if (response.ok) {
    return await response.json();
  }

  const details = (await response.text()).trim();
  const statusText = response.statusText || "Unknown status";

  if (!details) {
    throw new Error(`Local runner request failed (${response.status} ${statusText})`);
  }

  throw new Error(`Local runner request failed (${response.status} ${statusText}): ${details}`);
}

module.exports = {
  createDesktopRunnerController,
};

import { execFile, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
  attachProcessStderr,
  reserveLocalPort,
  resolveBunBinary,
  stopChildProcess,
  waitForPort,
} from "./node-utils.mjs";

const DEFAULT_OPENCODE_MODEL = "gpt-5.3-codex";
const DEFAULT_OPENCODE_PROVIDER = "openai";
const execFileAsync = promisify(execFile);
const DESKTOP_EDITOR_APPS = {
  cursor: "Cursor",
  vscode: "Visual Studio Code",
  zed: "Zed",
} as const;
const DESKTOP_EDITOR_COMMANDS = {
  cursor: "cursor",
  vscode: "code",
  zed: "zed",
} as const;

type CreateRunnerSessionArgs = {
  repoUrl: string;
  title: string;
};

type WorkspaceEditor = keyof typeof DESKTOP_EDITOR_APPS;

type RunnerModelProvider = {
  id: string;
  models: Record<string, { id: string; name: string }>;
  name: string;
};

type RunnerDiff = {
  additions: number;
  after: string;
  before: string;
  deletions: number;
  file: string;
};

type ListRunnerModelsResponse = {
  connected: string[];
  default: Record<string, string>;
  providers: RunnerModelProvider[];
};

type PromptRunnerTaskArgs = {
  backendBaseUrl: string;
  callbackToken: string;
  directory: string;
  executionId: string;
  model?: string;
  prompt: string;
  provider?: string;
  sessionId: string;
};

type DeleteRunnerWorkspaceArgs = {
  workspaceDirectory: string;
};

type OpenWorkspaceInEditorArgs = {
  editor: WorkspaceEditor;
  workspaceDirectory: string;
};

type RunnerProcess = {
  baseUrl: string;
  child: ChildProcess;
};

type AppRunnerController = {
  createRunnerSession: (args: CreateRunnerSessionArgs) => Promise<{
    runnerType: string;
    sessionId: string;
    workspaceDirectory: string;
  }>;
  deleteRunnerWorkspace: (args: DeleteRunnerWorkspaceArgs) => Promise<void>;
  getRunnerDiff: (args: { directory: string; sessionId: string }) => Promise<RunnerDiff[]>;
  listRunnerModels: (args: { directory: string }) => Promise<ListRunnerModelsResponse>;
  openWorkspaceInEditor: (args: OpenWorkspaceInEditorArgs) => Promise<void>;
  promptRunnerTask: (args: PromptRunnerTaskArgs) => Promise<void>;
  stop: () => Promise<void>;
};

type CreateAssistantSessionResponse = {
  sessionId: string;
  workspaceDirectory: string;
};

type PromptTaskAssistantSessionResponse = {
  ok: boolean;
};

type DeleteWorkspaceResponse = {
  ok: boolean;
};

type GetRunnerDiffResponse = {
  diffs: RunnerDiff[];
};

export function createDesktopRunnerController({
  workspaceRoot,
}: {
  workspaceRoot: string;
}): AppRunnerController {
  let runnerProcess: RunnerProcess | null = null;

  async function createRunnerSession({ repoUrl, title }: CreateRunnerSessionArgs): Promise<{
    runnerType: string;
    sessionId: string;
    workspaceDirectory: string;
  }> {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      throw new Error("title is required");
    }

    const runner = await ensureRunner();
    const payload = await postRunnerJson<CreateAssistantSessionResponse>(
      `${runner.baseUrl}/assistant/session/create`,
      {
        model: DEFAULT_OPENCODE_MODEL,
        provider: DEFAULT_OPENCODE_PROVIDER,
        repoUrl,
        taskTitle: trimmedTitle,
      },
    );

    return {
      runnerType: "local-worktree",
      sessionId: payload.sessionId,
      workspaceDirectory: payload.workspaceDirectory,
    };
  }

  async function listRunnerModels(args: { directory: string }): Promise<ListRunnerModelsResponse> {
    const runner = await ensureRunner();
    return await getRunnerJson<ListRunnerModelsResponse>(
      `${runner.baseUrl}/opencode/models?${new URLSearchParams({
        directory: args.directory,
      }).toString()}`,
    );
  }

  async function getRunnerDiff(args: {
    directory: string;
    sessionId: string;
  }): Promise<RunnerDiff[]> {
    const runner = await ensureRunner();
    const payload = await getRunnerJson<GetRunnerDiffResponse>(
      `${runner.baseUrl}/assistant/session/diff?${new URLSearchParams({
        directory: args.directory,
        sessionId: args.sessionId,
      }).toString()}`,
    );

    return payload.diffs;
  }

  async function promptRunnerTask(args: PromptRunnerTaskArgs): Promise<void> {
    const runner = await ensureRunner();
    const payload = await postRunnerJson<PromptTaskAssistantSessionResponse>(
      `${runner.baseUrl}/assistant/session/task-prompt`,
      {
        directory: args.directory,
        model: args.model,
        prompt: args.prompt,
        provider: args.provider,
        sessionId: args.sessionId,
        taskRun: {
          backendBaseUrl: args.backendBaseUrl,
          callbackToken: args.callbackToken,
          executionId: args.executionId,
        },
      },
    );

    if (!payload.ok) {
      throw new Error("Local runner task prompt did not complete successfully");
    }
  }

  async function openWorkspaceInEditor({
    editor,
    workspaceDirectory,
  }: OpenWorkspaceInEditorArgs): Promise<void> {
    const normalizedDirectory = workspaceDirectory.trim();

    if (normalizedDirectory.length === 0) {
      throw new Error("workspaceDirectory is required");
    }

    if (!fs.existsSync(normalizedDirectory)) {
      throw new Error(`Workspace directory not found: ${normalizedDirectory}`);
    }

    const appName = DESKTOP_EDITOR_APPS[editor];
    const command = DESKTOP_EDITOR_COMMANDS[editor];

    try {
      if (process.platform === "darwin") {
        await execFileAsync("open", ["-a", appName, normalizedDirectory]);
        return;
      }

      await execFileAsync(command, [normalizedDirectory]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to open workspace in ${appName}: ${message}`, { cause: error });
    }
  }

  async function deleteRunnerWorkspace({
    workspaceDirectory,
  }: DeleteRunnerWorkspaceArgs): Promise<void> {
    const runner = await ensureRunner();

    await postRunnerJson<DeleteWorkspaceResponse>(`${runner.baseUrl}/workspace/delete`, {
      workspaceDirectory,
    });
  }

  async function stop(): Promise<void> {
    if (!runnerProcess) {
      return;
    }

    const child = runnerProcess.child;
    runnerProcess = null;
    await stopChildProcess(child);
  }

  async function ensureRunner(): Promise<RunnerProcess> {
    if (runnerProcess && (await isRunnerHealthy(runnerProcess.baseUrl))) {
      return runnerProcess;
    }

    await stop();
    return await startRunner();
  }

  async function startRunner(): Promise<RunnerProcess> {
    const runnerEntry = path.join(workspaceRoot, "packages/runner/dist/cli.mjs");
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

    let childError: Error | null = null;
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

    const nextRunnerProcess: RunnerProcess = {
      baseUrl: `http://127.0.0.1:${port}`,
      child,
    };

    runnerProcess = nextRunnerProcess;
    return nextRunnerProcess;
  }

  return {
    createRunnerSession,
    deleteRunnerWorkspace,
    getRunnerDiff,
    listRunnerModels,
    openWorkspaceInEditor,
    promptRunnerTask,
    stop,
  };
}

async function isRunnerHealthy(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function getRunnerJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  return await parseRunnerJson<T>(response);
}

async function postRunnerJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return await parseRunnerJson<T>(response);
}

async function parseRunnerJson<T>(response: Response): Promise<T> {
  if (response.ok) {
    return (await response.json()) as T;
  }

  const details = (await response.text()).trim();
  const statusText = response.statusText || "Unknown status";

  if (!details) {
    throw new Error(`Local runner request failed (${response.status} ${statusText})`);
  }

  throw new Error(`Local runner request failed (${response.status} ${statusText}): ${details}`);
}

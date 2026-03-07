import type { Server } from "node:http";
import { createAdaptorServer } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { ensureAssistantSession, promptAssistantSession } from "./assistant-session";
import { listAssistantSessions } from "./list-assistant-sessions";
import {
  cleanupWorktree,
  listWorktreeDirectories,
  prepareWorktree,
  resolveRepoRoot,
} from "./managed-worktrees";
import {
  LOCAL_RUNNER_PROTOCOL_VERSION,
  type EnsureAssistantSessionRequest,
  type ListAssistantSessionsRequest,
  type ListOpencodeModelsRequest,
  type PromptAssistantSessionRequest,
} from "./local-runner-protocol";
import { listOpencodeModels } from "./opencode-models";
import { DEFAULT_OPENCODE_MODEL, DEFAULT_OPENCODE_PROVIDER } from "./opencode";

export type LocalRunnerServerOptions = {
  host?: string;
  port?: number;
};

export function createLocalRunnerApp(): Hono {
  const app = new Hono();

  app.use("*", async (c, next) => {
    try {
      await next();
    } finally {
      setCorsHeaders(c);
    }
  });

  app.options("*", (c) => c.body(null, 204));

  app.onError((error, c) => {
    return c.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      error instanceof RequestError ? error.statusCode : 500,
    );
  });

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/runner/info", (c) =>
    c.json({
      capabilities: {
        assistantSessions: true,
      },
      protocolVersion: LOCAL_RUNNER_PROTOCOL_VERSION,
      runnerType: "local-worktree",
    }),
  );

  app.get("/opencode/models", async (c) => {
    const directory = readDirectoryQuery(c);

    return c.json(
      await listOpencodeModels({
        directory,
      } satisfies ListOpencodeModelsRequest),
    );
  });

  app.get("/assistant/sessions", async (c) => {
    const directory = readDirectoryQuery(c);

    return c.json({
      sessions: await listAssistantSessions({
        directory,
      } satisfies ListAssistantSessionsRequest),
    });
  });

  app.post("/assistant/session/ensure", async (c) => {
    const body = await readJson<EnsureAssistantSessionRequest>(c);

    return c.json(
      await ensureAssistantSession({
        directory: body.directory,
        existingSessionId: body.sessionId,
        model: body.model,
        provider: body.provider,
        taskTitle: body.taskTitle,
      }),
    );
  });

  app.post("/assistant/session/prompt", async (c) => {
    const body = await readJson<PromptAssistantSessionRequest>(c);

    await promptAssistantSession(body);

    return c.json({ ok: true });
  });

  app.get("/repo/sessions", async (c) => {
    const repoUrl = c.req.query("repoUrl")?.trim() ?? "";
    if (!repoUrl) throw new RequestError("repoUrl query parameter is required");

    const repoRoot = resolveRepoRoot(repoUrl);
    const directories = listWorktreeDirectories(repoRoot);
    const seenIds = new Set<string>();
    const allSessions = [];

    for (const directory of directories) {
      const sessions = await listAssistantSessions({ directory });
      for (const session of sessions) {
        if (!seenIds.has(session.id)) {
          seenIds.add(session.id);
          allSessions.push(session);
        }
      }
    }

    allSessions.sort(
      (a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt,
    );

    return c.json({ sessions: allSessions, workspaceDirectory: repoRoot });
  });

  app.post("/repo/session", async (c) => {
    const body = await readJson<{ repoUrl: string; title: string }>(c);
    const title = body.title?.trim() ?? "";
    if (!title) throw new RequestError("title is required");

    const { directory, defaultDirectory, branchName } = prepareWorktree(body.repoUrl, title);

    try {
      const result = await ensureAssistantSession({
        directory,
        model: DEFAULT_OPENCODE_MODEL,
        provider: DEFAULT_OPENCODE_PROVIDER,
        taskTitle: title,
      });
      return c.json({ sessionId: result.sessionId });
    } catch (error) {
      cleanupWorktree(defaultDirectory, directory, branchName);
      throw error;
    }
  });

  app.notFound((c) => c.json({ error: `Unknown route: ${c.req.method} ${c.req.path}` }, 404));

  return app;
}

class RequestError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 404 = 400,
  ) {
    super(message);
  }
}

export function startLocalRunnerServer(options?: LocalRunnerServerOptions): Promise<Server> {
  const host = options?.host ?? "127.0.0.1";
  const port = options?.port ?? 4318;
  const app = createLocalRunnerApp();
  const server = createAdaptorServer({
    fetch: app.fetch,
    hostname: host,
    port,
  }) as Server;

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}

async function readJson<T>(c: Context): Promise<T> {
  const body = (await c.req.text()).trim();
  if (body.length === 0) {
    throw new RequestError("Expected JSON request body");
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new RequestError("Invalid JSON request body");
  }
}

function setCorsHeaders(c: Context): void {
  c.header("Access-Control-Allow-Headers", "Content-Type");
  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  c.header("Access-Control-Allow-Origin", "*");
}

function readDirectoryQuery(c: Context): string {
  const directory = c.req.query("directory")?.trim() ?? "";
  if (directory.length === 0) {
    throw new RequestError("directory query parameter is required");
  }

  return directory;
}

import type { Server } from "node:http";
import { createAdaptorServer } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { ensureAssistantSession, promptAssistantSession } from "./assistant-session";
import { listAssistantSessions } from "./list-assistant-sessions";
import {
  LOCAL_RUNNER_PROTOCOL_VERSION,
  type EnsureAssistantSessionRequest,
  type ListAssistantSessionsRequest,
  type ListOpencodeModelsRequest,
  type PromptAssistantSessionRequest,
  type PromptTaskAssistantSessionRequest,
} from "./local-runner-protocol";
import { listOpencodeModels } from "./opencode-models";
import { promptTaskAssistantSession } from "./task-assistant-session";

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

  app.post("/assistant/session/task-prompt", async (c) => {
    const body = await readJson<PromptTaskAssistantSessionRequest>(c);

    await promptTaskAssistantSession(body);

    return c.json({ ok: true });
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

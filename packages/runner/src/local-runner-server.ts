import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { ensureAssistantSession, promptAssistantSession } from "./assistant-session";
import {
  LOCAL_RUNNER_PROTOCOL_VERSION,
  type EnsureAssistantSessionRequest,
  type ListOpencodeModelsRequest,
  type PromptAssistantSessionRequest,
} from "./local-runner-protocol";
import { listOpencodeModels } from "./opencode-models";

export type LocalRunnerServerOptions = {
  host?: string;
  port?: number;
};

class RequestError extends Error {
  constructor(
    message: string,
    readonly statusCode: number = 400,
  ) {
    super(message);
  }
}

export function startLocalRunnerServer(options?: LocalRunnerServerOptions): Promise<Server> {
  const host = options?.host ?? "127.0.0.1";
  const port = options?.port ?? 4318;

  const server = createServer(async (request, response) => {
    try {
      await routeRequest(request, response);
    } catch (error) {
      sendJson(response, error instanceof RequestError ? error.statusCode : 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}

async function routeRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const method = request.method?.toUpperCase() ?? "GET";
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  const pathname = requestUrl.pathname;

  if (method === "GET" && pathname === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (method === "GET" && pathname === "/runner/info") {
    sendJson(response, 200, {
      capabilities: {
        assistantSessions: true,
      },
      protocolVersion: LOCAL_RUNNER_PROTOCOL_VERSION,
      runnerType: "local-worktree",
    });
    return;
  }

  if (method === "GET" && pathname === "/opencode/models") {
    const directory = readDirectoryQuery(requestUrl);
    sendJson(
      response,
      200,
      await listOpencodeModels({
        directory,
      } satisfies ListOpencodeModelsRequest),
    );
    return;
  }

  if (method === "POST" && pathname === "/assistant/session/ensure") {
    const body = await readJson<EnsureAssistantSessionRequest>(request);
    sendJson(
      response,
      200,
      await ensureAssistantSession({
        directory: body.directory,
        existingSessionId: body.sessionId,
        model: body.model,
        provider: body.provider,
        taskTitle: body.taskTitle,
      }),
    );
    return;
  }

  if (method === "POST" && pathname === "/assistant/session/prompt") {
    const body = await readJson<PromptAssistantSessionRequest>(request);
    await promptAssistantSession(body);
    sendJson(response, 200, { ok: true });
    return;
  }

  sendJson(response, 404, { error: `Unknown route: ${method} ${pathname}` });
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString("utf8").trim();
  if (body.length === 0) {
    throw new Error("Expected JSON request body");
  }

  return JSON.parse(body) as T;
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(body));
}

function readDirectoryQuery(requestUrl: URL): string {
  const directory = requestUrl.searchParams.get("directory")?.trim() ?? "";
  if (directory.length === 0) {
    throw new RequestError("directory query parameter is required");
  }

  return directory;
}

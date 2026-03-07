import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import type { Config } from "@opencode-ai/sdk";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4096;
const READY_RETRY_COUNT = 30;
const READY_RETRY_DELAY_MS = 500;

type OpencodeServerState = {
  child: ChildProcessWithoutNullStreams | null;
  host: string;
  port: number;
  configKey: string;
};

const serverState: OpencodeServerState = {
  child: null,
  host: DEFAULT_HOST,
  port: DEFAULT_PORT,
  configKey: "",
};

export type LocalOpencodeServer = {
  baseUrl: string;
  host: string;
  pid: number | null;
  port: number;
};

export async function ensureLocalOpencodeServer(config?: Config): Promise<LocalOpencodeServer> {
  const configKey = JSON.stringify(config ?? {});
  if (
    serverState.configKey === configKey &&
    (await isOpencodeServerReady(serverState.host, serverState.port))
  ) {
    serverState.configKey = configKey;
    return toLocalOpencodeServer();
  }

  if (serverState.child && !serverState.child.killed) {
    serverState.child.kill("SIGTERM");
    serverState.child = null;
  }

  serverState.child = spawn(
    "opencode",
    ["serve", "--hostname", serverState.host, "--port", String(serverState.port)],
    {
      env: {
        ...process.env,
        OPENCODE_CONFIG_CONTENT: JSON.stringify(config ?? {}),
      },
      stdio: "pipe",
    },
  );
  serverState.configKey = configKey;

  serverState.child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
  });

  serverState.child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
  });

  serverState.child.once("exit", () => {
    serverState.child = null;
  });

  for (let attempt = 0; attempt < READY_RETRY_COUNT; attempt++) {
    if (await isOpencodeServerReady(serverState.host, serverState.port)) {
      return toLocalOpencodeServer();
    }

    await sleep(READY_RETRY_DELAY_MS);
  }

  throw new Error("Timed out waiting for the local OpenCode server to become ready");
}

async function isOpencodeServerReady(host: string, port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://${host}:${port}/session/status`);
    if (!response.ok) {
      return false;
    }

    const body = (await response.text()).trim();
    if (body.length === 0) {
      return false;
    }

    const parsed = JSON.parse(body) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

function toLocalOpencodeServer(): LocalOpencodeServer {
  return {
    baseUrl: `http://${serverState.host}:${serverState.port}`,
    host: serverState.host,
    pid: serverState.child?.pid ?? null,
    port: serverState.port,
  };
}

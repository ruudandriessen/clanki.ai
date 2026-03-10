import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import net from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

import type { Config } from "@opencode-ai/sdk";

const DEFAULT_HOST = "127.0.0.1";
const READY_RETRY_COUNT = 30;
const READY_RETRY_DELAY_MS = 500;

type OpencodeServerState = {
    child: ChildProcessWithoutNullStreams | null;
    config: Config | undefined;
    host: string;
    port: number | null;
    startPromise: Promise<LocalOpencodeServer> | null;
};

const serverState: OpencodeServerState = {
    child: null,
    config: undefined,
    host: DEFAULT_HOST,
    port: null,
    startPromise: null,
};

export type LocalOpencodeServer = {
    baseUrl: string;
    host: string;
    pid: number | null;
    port: number;
};

export async function ensureLocalOpencodeServer(config?: Config): Promise<LocalOpencodeServer> {
    if (config !== undefined && serverState.config === undefined) {
        serverState.config = config;
    }

    if (
        serverState.child &&
        serverState.port !== null &&
        (await isOpencodeServerReady(serverState.host, serverState.port))
    ) {
        return toLocalOpencodeServer();
    }

    if (serverState.startPromise) {
        return await serverState.startPromise;
    }

    const startPromise = startLocalOpencodeServer();
    serverState.startPromise = startPromise;

    try {
        return await startPromise;
    } finally {
        if (serverState.startPromise === startPromise) {
            serverState.startPromise = null;
        }
    }
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

async function startLocalOpencodeServer(): Promise<LocalOpencodeServer> {
    await stopOpencodeServerChild();

    const port = await reserveLocalPort();
    const child = spawn(
        "opencode",
        ["serve", "--hostname", serverState.host, "--port", String(port)],
        {
            env: {
                ...process.env,
                OPENCODE_CONFIG_CONTENT: JSON.stringify(serverState.config ?? {}),
            },
            stdio: "pipe",
        },
    );

    serverState.child = child;
    serverState.port = port;

    child.stderr.on("data", (chunk) => {
        process.stderr.write(chunk);
    });

    child.stdout.on("data", (chunk) => {
        process.stdout.write(chunk);
    });

    child.once("exit", () => {
        if (serverState.child === child) {
            serverState.child = null;
            serverState.port = null;
        }
    });

    for (let attempt = 0; attempt < READY_RETRY_COUNT; attempt++) {
        if (await isOpencodeServerReady(serverState.host, port)) {
            return toLocalOpencodeServer();
        }

        if (child.exitCode !== null) {
            throw new Error(`Local OpenCode server exited with code ${child.exitCode}`);
        }

        await sleep(READY_RETRY_DELAY_MS);
    }

    await stopOpencodeServerChild();
    throw new Error("Timed out waiting for the local OpenCode server to become ready");
}

async function stopOpencodeServerChild(): Promise<void> {
    const child = serverState.child;
    if (!child) {
        serverState.port = null;
        return;
    }

    if (child.exitCode !== null) {
        serverState.child = null;
        serverState.port = null;
        return;
    }

    await new Promise<void>((resolve) => {
        const timeoutId = setTimeout(() => {
            child.kill("SIGKILL");
            resolve();
        }, 1_000);

        child.once("exit", () => {
            clearTimeout(timeoutId);
            resolve();
        });

        child.kill("SIGTERM");
    });

    serverState.child = null;
    serverState.port = null;
}

async function reserveLocalPort(): Promise<number> {
    return await new Promise((resolve, reject) => {
        const server = net.createServer();

        server.once("error", reject);
        server.listen(0, serverState.host, () => {
            const address = server.address();

            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                if (!address || typeof address === "string") {
                    reject(new Error("Failed to reserve a local port for OpenCode"));
                    return;
                }

                resolve(address.port);
            });
        });
    });
}

function toLocalOpencodeServer(): LocalOpencodeServer {
    if (serverState.port === null) {
        throw new Error("Local OpenCode server port is not available");
    }

    return {
        baseUrl: `http://${serverState.host}:${serverState.port}`,
        host: serverState.host,
        pid: serverState.child?.pid ?? null,
        port: serverState.port,
    };
}

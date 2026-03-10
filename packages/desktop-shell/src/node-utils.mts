import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

import type { ChildProcess } from "node:child_process";

type WaitOptions = {
  check?: () => void;
  timeoutMs?: number;
};

export function attachProcessStderr(child: ChildProcess): void {
  child.stderr?.on("data", (chunk: Buffer | string) => {
    process.stderr.write(chunk);
  });
}

export async function reserveLocalPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        if (!address || typeof address === "string") {
          reject(new Error("Failed to resolve a local port"));
          return;
        }

        resolve(address.port);
      });
    });
  });
}

export async function waitForHttpUrl(url: string, options: WaitOptions = {}): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    options.check?.();

    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.ok) {
        return;
      }
    } catch {}

    await delay(100);
  }

  options.check?.();
  throw new Error(`Timed out waiting for ${url}`);
}

export async function waitForPort(port: number, options: WaitOptions = {}): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    options.check?.();

    if (await canConnect(port)) {
      return;
    }

    await delay(100);
  }

  options.check?.();
  throw new Error(`Timed out waiting for a local server on port ${port}`);
}

export function resolveBunBinary(): string {
  const configuredPath = process.env.BUN_BINARY?.trim();
  return configuredPath || "bun";
}

export async function stopChildProcess(child: ChildProcess | null | undefined): Promise<void> {
  if (!child || child.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeoutId = setTimeout(resolve, 1_000);

    child.once("exit", () => {
      clearTimeout(timeoutId);
      resolve();
    });

    child.kill();
  });
}

async function canConnect(port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });

    const finish = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

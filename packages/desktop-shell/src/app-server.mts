import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  attachProcessStderr,
  reserveLocalPort,
  resolveBunBinary,
  stopChildProcess,
  waitForHttpUrl,
  waitForPort,
} from "./node-utils.mjs";

type AppServerController = {
  resolveAppUrl: () => Promise<string>;
  stop: () => Promise<void>;
};

export function createAppServerController({
  workspaceRoot,
}: {
  workspaceRoot: string;
}): AppServerController {
  let baseUrl: string | null = null;
  let serverProcess: ChildProcess | null = null;

  async function resolveAppUrl(): Promise<string> {
    const devUrl = process.env.CLANKI_ELECTRON_DEV_URL?.trim();
    if (devUrl) {
      await waitForHttpUrl(devUrl);
      return devUrl;
    }

    if (baseUrl && serverProcess && serverProcess.exitCode === null) {
      return baseUrl;
    }

    await stop();

    const serverEntry = path.join(workspaceRoot, ".output/server/index.mjs");
    if (!fs.existsSync(serverEntry)) {
      throw new Error(`Built app server not found at ${serverEntry}`);
    }

    const port = await reserveLocalPort();
    const child = spawn(resolveBunBinary(), [serverEntry], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: String(port),
      },
      stdio: ["ignore", "ignore", "pipe"],
    });

    attachProcessStderr(child);

    let childError: Error | null = null;
    child.once("error", (error) => {
      childError = error;
    });

    await waitForPort(port, {
      check() {
        if (childError) {
          throw new Error(`Failed to start the local Clanki server: ${childError.message}`);
        }

        if (child.exitCode !== null) {
          throw new Error(`The local Clanki server exited with code ${child.exitCode}`);
        }
      },
    });

    baseUrl = `http://127.0.0.1:${port}`;
    serverProcess = child;
    return baseUrl;
  }

  async function stop(): Promise<void> {
    if (!serverProcess) {
      return;
    }

    const child = serverProcess;
    serverProcess = null;
    baseUrl = null;
    await stopChildProcess(child);
  }

  return {
    resolveAppUrl,
    stop,
  };
}

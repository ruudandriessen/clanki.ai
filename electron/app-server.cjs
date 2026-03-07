const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const {
  attachProcessStderr,
  reserveLocalPort,
  resolveBunBinary,
  stopChildProcess,
  waitForHttpUrl,
  waitForPort,
} = require("./node-utils.cjs");

function createAppServerController({ workspaceRoot }) {
  let baseUrl = null;
  let serverProcess = null;

  async function resolveAppUrl() {
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

    let childError = null;
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

  async function stop() {
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

module.exports = {
  createAppServerController,
};

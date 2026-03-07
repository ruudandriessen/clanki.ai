const { spawnSync } = require("node:child_process");
const net = require("node:net");
const { setTimeout: delay } = require("node:timers/promises");

function attachProcessStderr(child) {
  child.stderr?.on("data", (chunk) => {
    process.stderr.write(chunk);
  });
}

async function reserveLocalPort() {
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

async function waitForPort(port, options = {}) {
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

async function waitForHttpUrl(url, options = {}) {
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

function resolveBunBinary() {
  const configuredPath = process.env.BUN_BINARY?.trim();
  return configuredPath || "bun";
}

function runCommand(program, args, errorContext) {
  const output = spawnSync(program, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (output.error) {
    const message = errorContext
      ? `${errorContext}: ${output.error.message}`
      : `Failed to run ${program}: ${output.error.message}`;
    throw new Error(message);
  }

  if (output.status === 0) {
    return output.stdout;
  }

  const stderr = output.stderr.trim();
  const stdout = output.stdout.trim();
  const details = stderr || stdout || `exit status ${output.status}`;

  if (errorContext) {
    throw new Error(`${errorContext}: ${details}`);
  }

  throw new Error(`Command ${program} failed: ${details}`);
}

async function stopChildProcess(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    const timeoutId = setTimeout(resolve, 1_000);
    child.once("exit", () => {
      clearTimeout(timeoutId);
      resolve();
    });
    child.kill();
  });
}

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });

    const finish = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

module.exports = {
  attachProcessStderr,
  reserveLocalPort,
  resolveBunBinary,
  runCommand,
  stopChildProcess,
  waitForHttpUrl,
  waitForPort,
};

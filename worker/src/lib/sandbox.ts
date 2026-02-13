import { getSandbox } from "@cloudflare/sandbox";
import { createOpencode } from "@cloudflare/sandbox/opencode";
import type { Sandbox } from "@cloudflare/sandbox";
import type { Config, OpencodeClient } from "@opencode-ai/sdk";

const SANDBOX_SLEEP_AFTER = "15m";
const OPENCODE_COMMAND = "opencode serve --port 4096 --hostname 0.0.0.0";

export type SandboxEnv = {
  Sandbox: DurableObjectNamespace<Sandbox>;
};

/** Get or resume a sandbox for a given scope key. */
export function getTaskSandbox(env: SandboxEnv, sandboxId: string) {
  return getSandbox(env.Sandbox, sandboxId, {
    sleepAfter: SANDBOX_SLEEP_AFTER,
    normalizeId: true,
  });
}

/** Start (or connect to) the OpenCode server inside the sandbox and return a typed client. */
export async function getOpenCodeClient(
  sandbox: Sandbox,
  directory: string,
  config?: Config,
  options?: { restartServer?: boolean },
) {
  const restartServer = options?.restartServer ?? true;
  if (restartServer) {
    await restartOpenCodeServer(sandbox);
  }
  return createOpencode<OpencodeClient>(sandbox, { directory, config });
}

async function restartOpenCodeServer(sandbox: Sandbox): Promise<void> {
  const processes = await sandbox.listProcesses();
  for (const process of processes) {
    if (!process.command.includes(OPENCODE_COMMAND)) {
      continue;
    }

    try {
      await process.kill("SIGTERM");
    } catch {}
  }
}

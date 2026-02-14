import { getSandbox } from "@cloudflare/sandbox";
import { createOpencode } from "@cloudflare/sandbox/opencode";
import type { Sandbox } from "@cloudflare/sandbox";
import { OpencodeClient, type Config } from "@opencode-ai/sdk";

const SANDBOX_SLEEP_AFTER = "15m";

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
export async function getOpenCodeClient(sandbox: Sandbox, directory: string, config?: Config) {
  const mergedConfig: Config = {
    ...config,
    permission: {
      ...config?.permission,
      external_directory: "deny",
    },
  };

  return createOpencode<OpencodeClient>(sandbox, { directory, config: mergedConfig });
}

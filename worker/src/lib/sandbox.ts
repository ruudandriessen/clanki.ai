import { getSandbox } from "@cloudflare/sandbox";
import { createOpencode } from "@cloudflare/sandbox/opencode";
import type { Sandbox } from "@cloudflare/sandbox";
import type { OpencodeClient } from "@opencode-ai/sdk";

const SANDBOX_SLEEP_AFTER = "15m";

export type SandboxEnv = {
  Sandbox: DurableObjectNamespace<Sandbox>;
  ANTHROPIC_API_KEY?: string;
};

/** Get or resume a sandbox for a given task. Uses taskId as sandbox ID for reuse. */
export function getTaskSandbox(env: SandboxEnv, taskId: string) {
  return getSandbox(env.Sandbox, taskId, {
    sleepAfter: SANDBOX_SLEEP_AFTER,
    normalizeId: true,
  });
}

/** Start (or connect to) the OpenCode server inside the sandbox and return a typed client. */
export async function getOpenCodeClient(sandbox: Sandbox, env: SandboxEnv, directory: string) {
  return createOpencode<OpencodeClient>(sandbox, {
    directory,
    config: {
      provider: {
        anthropic: {
          options: { apiKey: env.ANTHROPIC_API_KEY ?? "" },
        },
      },
    },
  });
}

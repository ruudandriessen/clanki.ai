import { getTaskSandbox, type SandboxEnv } from "../sandbox";

export async function prepareSandbox(args: { env: SandboxEnv; sandboxId?: string | null }) {
  const sandbox = await getTaskSandbox(args.env, args.sandboxId);
  const sandboxId = sandbox.sandboxId;
  return { sandbox, sandboxId };
}

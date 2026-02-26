import { getTaskSandbox, type SandboxEnv } from "../sandbox";

export async function prepareSandbox(args: {
  env: SandboxEnv;
  userPorts: number[];
  sandboxId?: string | null;
}) {
  const sandbox = await getTaskSandbox(args.env, args.userPorts, args.sandboxId);
  const sandboxId = sandbox.sandboxId;
  return { sandbox, sandboxId };
}

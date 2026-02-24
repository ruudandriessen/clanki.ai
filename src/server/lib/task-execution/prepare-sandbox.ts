import { buildTaskSandboxId } from "../opencode";
import { getTaskSandbox, type SandboxEnv } from "../sandbox";

export function prepareSandbox(args: { env: SandboxEnv; taskId: string }) {
  const sandboxId = buildTaskSandboxId({ taskId: args.taskId });
  const sandbox = getTaskSandbox(args.env, sandboxId);
  return { sandbox, sandboxId };
}

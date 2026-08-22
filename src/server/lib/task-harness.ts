import { opencodeText } from "@tanstack/ai-opencode";
import { defineSandbox, defineWorkspace, localSource } from "@tanstack/ai-sandbox";
import { localProcessSandbox } from "@tanstack/ai-sandbox-local-process";

export type TaskHarness = "opencode";

export function createTaskChatAdapter(args: {
  harness: TaskHarness;
  modelRef: string;
  port: number;
}) {
  switch (args.harness) {
    case "opencode":
      return opencodeText(args.modelRef, {
        directory: "/workspace",
        permissionMode: "bypassPermissions",
        port: args.port,
      });
  }
}

export function createTaskSandbox(args: { taskId: string; workspacePath: string }) {
  return defineSandbox({
    id: `task-${args.taskId}`,
    provider: localProcessSandbox({ dir: args.workspacePath }),
    workspace: defineWorkspace({
      source: localSource(args.workspacePath),
      root: "/workspace",
    }),
    lifecycle: {
      reuse: "thread",
      destroyOnComplete: false,
    },
    fileEvents: false,
  });
}

export function opencodePortForTask(taskId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < taskId.length; index += 1) {
    hash ^= taskId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return 4100 + ((hash >>> 0) % 1900);
}

import { InMemorySandboxInstanceStore } from "@tanstack/ai-sandbox";
import { localProcessSandbox } from "@tanstack/ai-sandbox-local-process";

export const taskSandboxInstances = new InMemorySandboxInstanceStore();
export const taskSandboxProvider = localProcessSandbox({});

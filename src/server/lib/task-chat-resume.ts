import { taskChatDurability } from "@/server/lib/task-chat-durability";

export function shouldResumeTaskChat(request: Request): boolean {
  const durability = taskChatDurability(request);
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId");
  const offset = url.searchParams.get("offset");
  return durability.resumeFrom() !== null || (runId !== null && offset !== null);
}

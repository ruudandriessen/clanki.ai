import type { FileDiff } from "@opencode-ai/sdk";
import { createLocalRunnerOpencodeClient } from "./opencode-client";

export async function getAssistantSessionDiff(args: {
  directory: string;
  messageId?: string;
  sessionId: string;
}): Promise<FileDiff[]> {
  const { client } = await createLocalRunnerOpencodeClient({
    directory: args.directory,
  });
  const response = await client.session.diff({
    path: {
      id: args.sessionId,
    },
    query: {
      directory: args.directory,
      messageID: args.messageId,
    },
  });

  if (!response.response.ok || !response.data) {
    throw new Error("Failed to fetch session diff from OpenCode");
  }

  return response.data;
}

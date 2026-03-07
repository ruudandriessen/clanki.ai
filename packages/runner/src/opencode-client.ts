import { createOpencodeClient, type Config } from "@opencode-ai/sdk";
import { ensureLocalOpencodeServer } from "./opencode-server";

export async function createLocalRunnerOpencodeClient(args: {
  directory: string;
  config?: Config;
}) {
  const server = await ensureLocalOpencodeServer(args.config);

  return {
    client: createOpencodeClient({
      baseUrl: server.baseUrl,
      directory: args.directory,
    }),
    server,
  };
}

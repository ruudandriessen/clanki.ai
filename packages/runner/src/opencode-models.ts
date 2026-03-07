import { createLocalRunnerOpencodeClient } from "./opencode-client";
import type { ListOpencodeModelsResponse } from "./local-runner-protocol";

export async function listOpencodeModels(args: {
  directory: string;
}): Promise<ListOpencodeModelsResponse> {
  const directory = args.directory.trim();
  if (directory.length === 0) {
    throw new Error("directory is required");
  }

  const { client } = await createLocalRunnerOpencodeClient({ directory });
  const providerListResponse = await client.provider.list({
    query: { directory },
  });

  if (!providerListResponse.response.ok) {
    throw new Error(formatStatusError("Failed to list OpenCode models", providerListResponse));
  }

  return {
    connected: providerListResponse.data?.connected ?? [],
    default: providerListResponse.data?.default ?? {},
    providers: providerListResponse.data?.all ?? [],
  };
}

function formatStatusError(
  prefix: string,
  response: { response: Response; data?: unknown | null },
): string {
  const statusText = response.response.statusText.trim();
  const statusInfo =
    statusText.length > 0
      ? `${response.response.status} ${statusText}`
      : String(response.response.status);

  return `${prefix} (${statusInfo})`;
}

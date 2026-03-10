import { createLocalRunnerOpencodeClient } from "./opencode-client";

import type { AssistantSessionSummary } from "./local-runner-protocol";

export async function listAssistantSessions(args: {
    directory: string;
}): Promise<AssistantSessionSummary[]> {
    const { client } = await createLocalRunnerOpencodeClient({
        directory: args.directory,
    });
    const response = await client.session.list({
        query: { directory: args.directory },
    });

    if (!response.response.ok || !response.data) {
        throw new Error(formatStatusError("Failed to list OpenCode sessions", response.response));
    }

    return response.data
        .slice()
        .toSorted(
            (left, right) =>
                right.time.updated - left.time.updated || right.time.created - left.time.created,
        )
        .map((session) => ({
            createdAt: session.time.created,
            directory: session.directory,
            id: session.id,
            title: session.title,
            updatedAt: session.time.updated,
        }));
}

function formatStatusError(prefix: string, response: Response): string {
    const statusText = response.statusText.trim();
    const statusInfo = statusText.length > 0 ? `${response.status} ${statusText}` : response.status;

    return `${prefix} (${statusInfo})`;
}

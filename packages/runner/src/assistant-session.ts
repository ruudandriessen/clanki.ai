import { toProviderModelRef } from "./opencode";
import { createLocalRunnerOpencodeClient } from "./opencode-client";

export async function ensureAssistantSession(args: {
    directory: string;
    existingSessionId?: string | null;
    model?: string;
    provider?: string;
    taskTitle: string;
}): Promise<{ isNewSession: boolean; sessionId: string }> {
    const clientConfig =
        args.provider && args.model
            ? {
                  enabled_providers: [args.provider],
                  model: toProviderModelRef(args.provider, args.model),
              }
            : undefined;
    const { client } = await createLocalRunnerOpencodeClient({
        directory: args.directory,
        config: clientConfig,
    });

    let sessionId = args.existingSessionId?.trim() ?? "";
    let isNewSession = false;

    if (sessionId.length > 0) {
        try {
            const existing = await client.session.get({
                path: { id: sessionId },
                query: { directory: args.directory },
            });
            if (!existing.data) {
                sessionId = "";
            }
        } catch {
            sessionId = "";
        }
    }

    if (sessionId.length === 0) {
        const createResponse = await client.session.create({
            query: { directory: args.directory },
            body: { title: args.taskTitle },
        });

        if (!createResponse.response.ok || !createResponse.data?.id) {
            throw new Error(formatStatusError("Failed to create OpenCode session", createResponse));
        }

        sessionId = createResponse.data.id;
        isNewSession = true;
    }

    return { isNewSession, sessionId };
}

export async function promptAssistantSession(args: {
    directory: string;
    model?: string;
    provider?: string;
    prompt: string;
    sessionId: string;
}): Promise<void> {
    const { client } = await createLocalRunnerOpencodeClient({
        directory: args.directory,
    });
    const promptResponse = await client.session.promptAsync({
        path: { id: args.sessionId },
        query: { directory: args.directory },
        body: {
            model:
                args.provider && args.model
                    ? {
                          modelID: args.model,
                          providerID: args.provider,
                      }
                    : undefined,
            parts: [{ type: "text", text: args.prompt }],
        },
    });

    if (!promptResponse.response.ok) {
        throw new Error(
            formatStatusError("Failed to dispatch prompt to OpenCode session", promptResponse),
        );
    }
}

function formatStatusError(
    prefix: string,
    response:
        | { response: Response; data?: { id?: string } | null }
        | { response: Response; data?: unknown | null },
): string {
    const statusText = response.response.statusText.trim();
    const statusInfo =
        statusText.length > 0
            ? `${response.response.status} ${statusText}`
            : String(response.response.status);

    return `${prefix} (${statusInfo})`;
}

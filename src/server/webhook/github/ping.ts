import type { EmitterWebhookEvent } from "@octokit/webhooks";

export async function handlePing(event: EmitterWebhookEvent<"ping">): Promise<void> {
    console.log("Received ping event:", event.payload.zen);
}

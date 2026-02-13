import { Webhooks } from "@octokit/webhooks";
import type { Context } from "hono";
import type { AppDb } from "../../db/client";
import { handleInstallation } from "./installation";
import { handlePing } from "./ping";
import { handlePullRequest } from "./pull-request";

function createWebhooks(secret: string, db: AppDb): Webhooks {
  const webhooks = new Webhooks({ secret });

  webhooks.on("pull_request", async (event) => {
    await handlePullRequest(event, db);
  });

  webhooks.on("installation", async (event) => {
    await handleInstallation(event, db);
  });

  webhooks.on("ping", async (event) => {
    await handlePing(event);
  });

  return webhooks;
}

export async function handleGitHubWebhook(c: Context): Promise<Response> {
  const request = c.req.raw;

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const signature = request.headers.get("x-hub-signature-256");
    const event = request.headers.get("x-github-event");
    const delivery = request.headers.get("x-github-delivery");
    const body = await request.text();

    if (!signature || !event || !delivery) {
      return new Response("Missing required headers", { status: 400 });
    }

    console.log(`Received GitHub event: ${event} (${delivery})`);

    const db = c.get("db");
    const secret = c.env.GITHUB_WEBHOOK_SECRET;

    const webhooks = createWebhooks(secret, db);
    await webhooks.verifyAndReceive({
      id: delivery,
      name: event,
      signature,
      payload: body,
    });

    return c.json({ message: "Event processed" });
  } catch (error) {
    console.error("Webhook error:", error);
    if (error instanceof Error && error.message.includes("signature")) {
      return new Response("Invalid signature", { status: 401 });
    }
    return new Response("Internal server error", { status: 500 });
  }
}

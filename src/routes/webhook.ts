import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { Webhooks } from "@octokit/webhooks";
import { getDb } from "@/server/db/client";
import { handleCheckRun } from "@/server/webhook/github/check-run";
import { handleCheckSuite } from "@/server/webhook/github/check-suite";
import { handleInstallation } from "@/server/webhook/github/installation";
import { handlePing } from "@/server/webhook/github/ping";
import { handlePullRequest } from "@/server/webhook/github/pull-request";
import { handlePullRequestReview } from "@/server/webhook/github/pull-request-review";

function createWebhooks(secret: string, db: ReturnType<typeof getDb>): Webhooks {
  const webhooks = new Webhooks({ secret });

  webhooks.on("pull_request", async (event) => {
    await handlePullRequest(event, db);
  });

  webhooks.on("pull_request_review", async (event) => {
    await handlePullRequestReview(event, db);
  });

  webhooks.on("check_suite", async (event) => {
    await handleCheckSuite(event, db);
  });

  webhooks.on("check_run", async (event) => {
    await handleCheckRun(event, db);
  });

  webhooks.on("installation", async (event) => {
    await handleInstallation(event, db);
  });

  webhooks.on("ping", async (event) => {
    await handlePing(event);
  });

  return webhooks;
}

export const Route = createFileRoute("/webhook")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const signature = request.headers.get("x-hub-signature-256");
          const event = request.headers.get("x-github-event");
          const delivery = request.headers.get("x-github-delivery");
          const body = await request.text();

          if (!signature || !event || !delivery) {
            return new Response("Missing required headers", { status: 400 });
          }

          console.log(`Received GitHub event: ${event} (${delivery})`);

          const db = getDb(env);
          const secret = env.GITHUB_WEBHOOK_SECRET;

          const webhooks = createWebhooks(secret, db);
          await webhooks.verifyAndReceive({
            id: delivery,
            name: event,
            signature,
            payload: body,
          });

          return Response.json({ message: "Event processed" });
        } catch (error) {
          console.error("Webhook error:", error);
          if (error instanceof Error && error.message.includes("signature")) {
            return new Response("Invalid signature", { status: 401 });
          }
          return new Response("Internal server error", { status: 500 });
        }
      },
    },
  },
});

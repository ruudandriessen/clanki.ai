import type { APIRoute } from "astro";
import { createClient } from "@vercel/kv";

export const prerender = false;

const WAITLIST_KEY = "waitlist:emails";

function getKvClient() {
  const url = import.meta.env.KV_REST_API_URL;
  const token = import.meta.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("Missing KV_REST_API_URL or KV_REST_API_TOKEN");
  }
  return createClient({ url, token });
}

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const email = body?.email;

  if (typeof email !== "string" || !email.includes("@")) {
    return new Response(JSON.stringify({ error: "Invalid email" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const normalized = email.trim().toLowerCase();

  const kv = getKvClient();
  await kv.sadd(WAITLIST_KEY, normalized);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

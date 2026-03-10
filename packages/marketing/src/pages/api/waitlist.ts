import Redis from "ioredis";

import type { APIRoute } from "astro";

export const prerender = false;

const WAITLIST_KEY = "waitlist:emails";

export const POST: APIRoute = async ({ request }) => {
    const body = await request.json().catch(() => null);
    const email = body?.email;

    if (typeof email !== "string" || !email.includes("@")) {
        return new Response(JSON.stringify({ error: "Invalid email" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    const redisUrl = import.meta.env.REDIS_URL;
    if (!redisUrl) {
        return new Response(JSON.stringify({ error: "Server misconfigured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }

    const normalized = email.trim().toLowerCase();
    const redis = new Redis(redisUrl);
    try {
        await redis.sadd(WAITLIST_KEY, normalized);
    } finally {
        redis.disconnect();
    }

    return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
};

import { createFileRoute } from "@tanstack/react-router";
import { createAuth } from "@/server/auth";
import { getEnv } from "@/server/env";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const env = getEnv();
        const auth = createAuth(env, request);
        return auth.handler(request);
      },
      POST: async ({ request }: { request: Request }) => {
        const env = getEnv();
        const auth = createAuth(env, request);
        return auth.handler(request);
      },
    },
  },
});

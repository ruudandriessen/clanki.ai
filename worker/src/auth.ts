import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { oAuthProxy } from "better-auth/plugins/oauth-proxy";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./db/schema";

type AuthEnv = {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  PRODUCTION_URL: string;
};

export function createAuth(env: AuthEnv, request: Request) {
  const origin = new URL(request.url).origin;
  const db = drizzle(env.DB, { schema });
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: origin,
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        redirectURI: `${env.PRODUCTION_URL}/api/auth/callback/github`,
      },
    },
    plugins: [
      oAuthProxy({
        productionURL: env.PRODUCTION_URL,
      }),
    ],
    trustedOrigins: [origin, "http://localhost:5173"],
  });
}

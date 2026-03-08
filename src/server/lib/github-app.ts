import { createSign } from "node:crypto";
import type { AppEnv } from "@/server/env";

const GITHUB_API_URL = "https://api.github.com";
const JWT_LIFETIME_SECONDS = 9 * 60;

type GitHubAppInfo = {
  slug: string;
};

let cachedAppInfo: {
  appId: string;
  privateKey: string;
  expiresAt: number;
  value: GitHubAppInfo;
} | null = null;

async function fetchGitHubAppInfo(env: AppEnv): Promise<GitHubAppInfo | null> {
  const appId = env.GITHUB_APP_ID?.trim();
  const privateKey = env.GITHUB_APP_PRIVATE_KEY?.trim();

  if (!appId || !privateKey) {
    return null;
  }

  const now = Date.now();
  if (
    cachedAppInfo &&
    cachedAppInfo.appId === appId &&
    cachedAppInfo.privateKey === privateKey &&
    cachedAppInfo.expiresAt > now
  ) {
    return cachedAppInfo.value;
  }

  const token = createGitHubAppJwt(appId, privateKey);
  const response = await fetch(`${GITHUB_API_URL}/app`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "clanki-worker",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to load GitHub App metadata");
  }

  const data = (await response.json()) as Partial<{ slug: string }>;
  const slug = data.slug?.trim();
  if (!slug) {
    throw new Error("GitHub App slug is missing");
  }

  const value = { slug };
  cachedAppInfo = {
    appId,
    privateKey,
    expiresAt: now + 5 * 60 * 1000,
    value,
  };

  return value;
}

export async function fetchGitHubAppInstallUrl(env: AppEnv): Promise<string | null> {
  const appInfo = await fetchGitHubAppInfo(env);
  if (!appInfo) {
    return null;
  }

  return `https://github.com/apps/${appInfo.slug}/installations/new`;
}

function createGitHubAppJwt(appId: string, privateKey: string): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = encodeJwtPart({ alg: "RS256", typ: "JWT" });
  const payload = encodeJwtPart({
    iat: issuedAt - 60,
    exp: issuedAt + JWT_LIFETIME_SECONDS,
    iss: appId,
  });
  const unsignedToken = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256")
    .update(unsignedToken)
    .end()
    .sign(privateKey, "base64url");
  return `${unsignedToken}.${signature}`;
}

function encodeJwtPart(value: Record<string, number | string>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

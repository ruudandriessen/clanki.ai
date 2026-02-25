import type { Auth } from "@opencode-ai/sdk";
import { and, eq } from "drizzle-orm";
import type { AppDb } from "../db/client";
import * as schema from "../db/schema";
import type { SupportedOpencodeProvider } from "./opencode";
import { decryptSecret, encryptSecret, type SecretCryptoEnv } from "./secret-crypto";

type ProviderAuthType = Auth["type"];
type ProviderCredentialStatus = {
  provider: string;
  configured: boolean;
  authType: ProviderAuthType | null;
  updatedAt: number | null;
};

export async function upsertProviderApiKeyCredential(
  db: AppDb,
  env: SecretCryptoEnv,
  userId: string,
  provider: SupportedOpencodeProvider,
  apiKey: string,
): Promise<ProviderCredentialStatus> {
  const auth: Auth = { type: "api", key: apiKey };
  return upsertProviderCredential(db, env, userId, provider, auth, apiKey);
}

export async function upsertProviderAuthCredential(
  db: AppDb,
  env: SecretCryptoEnv,
  userId: string,
  provider: SupportedOpencodeProvider,
  auth: Auth,
): Promise<ProviderCredentialStatus> {
  const apiKeyValue = auth.type === "api" ? auth.key : "";
  return upsertProviderCredential(db, env, userId, provider, auth, apiKeyValue);
}

export async function deleteProviderCredential(
  db: AppDb,
  userId: string,
  provider: SupportedOpencodeProvider,
): Promise<void> {
  await db
    .delete(schema.userProviderCredentials)
    .where(
      and(
        eq(schema.userProviderCredentials.userId, userId),
        eq(schema.userProviderCredentials.provider, provider),
      ),
    );
}

export async function getDecryptedProviderAuth(
  db: AppDb,
  env: SecretCryptoEnv,
  userId: string,
  provider: SupportedOpencodeProvider,
): Promise<Auth | null> {
  const row = await db.query.userProviderCredentials.findFirst({
    where: and(
      eq(schema.userProviderCredentials.userId, userId),
      eq(schema.userProviderCredentials.provider, provider),
    ),
    columns: {
      authType: true,
      encryptedApiKey: true,
      encryptedAuthJson: true,
    },
  });

  if (!row) {
    return null;
  }

  const authFromJson = await decryptAuthJson(row.encryptedAuthJson, env);
  if (authFromJson) {
    return authFromJson;
  }

  // Backward compatibility for rows created before encrypted_auth_json existed.
  const apiKey = await decryptSecret(env, row.encryptedApiKey);
  if (apiKey.trim().length === 0) {
    return null;
  }

  return { type: "api", key: apiKey };
}

async function upsertProviderCredential(
  db: AppDb,
  env: SecretCryptoEnv,
  userId: string,
  provider: SupportedOpencodeProvider,
  auth: Auth,
  encryptedApiKeyValue: string,
): Promise<ProviderCredentialStatus> {
  const encryptedApiKey = await encryptSecret(env, encryptedApiKeyValue);
  const encryptedAuthJson = await encryptSecret(env, JSON.stringify(auth));
  const authType = auth.type;
  const now = Date.now();
  const existing = await db.query.userProviderCredentials.findFirst({
    where: and(
      eq(schema.userProviderCredentials.userId, userId),
      eq(schema.userProviderCredentials.provider, provider),
    ),
    columns: { id: true },
  });

  if (existing) {
    await db
      .update(schema.userProviderCredentials)
      .set({
        authType,
        encryptedApiKey,
        encryptedAuthJson,
        updatedAt: now,
      })
      .where(eq(schema.userProviderCredentials.id, existing.id));
  } else {
    await db.insert(schema.userProviderCredentials).values({
      id: crypto.randomUUID(),
      userId,
      provider,
      authType,
      encryptedApiKey,
      encryptedAuthJson,
      createdAt: now,
      updatedAt: now,
    });
  }

  return {
    provider,
    configured: true,
    authType,
    updatedAt: now,
  };
}

async function decryptAuthJson(
  encryptedAuthJson: string | null,
  env: SecretCryptoEnv,
): Promise<Auth | null> {
  if (!encryptedAuthJson) {
    return null;
  }

  try {
    const json = await decryptSecret(env, encryptedAuthJson);
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !("type" in parsed)) {
      return null;
    }

    const type = (parsed as { type?: unknown }).type;
    if (type === "api" && typeof (parsed as { key?: unknown }).key === "string") {
      return parsed as Auth;
    }

    if (
      type === "oauth" &&
      typeof (parsed as { access?: unknown }).access === "string" &&
      typeof (parsed as { refresh?: unknown }).refresh === "string" &&
      typeof (parsed as { expires?: unknown }).expires === "number"
    ) {
      return parsed as Auth;
    }

    if (
      type === "wellknown" &&
      typeof (parsed as { key?: unknown }).key === "string" &&
      typeof (parsed as { token?: unknown }).token === "string"
    ) {
      return parsed as Auth;
    }
  } catch {}

  return null;
}

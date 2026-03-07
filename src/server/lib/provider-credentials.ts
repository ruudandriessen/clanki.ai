import type { Auth } from "@opencode-ai/sdk";
import { and, eq } from "drizzle-orm";
import type { AppDb } from "../db/client";
import * as schema from "../db/schema";
import type { SupportedOpencodeProvider } from "./opencode";
import { encryptSecret, type SecretCryptoEnv } from "./secret-crypto";

type ProviderAuthType = Auth["type"];
type ProviderCredentialStatus = {
  provider: string;
  configured: boolean;
  authType: ProviderAuthType | null;
  updatedAt: number | null;
};

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

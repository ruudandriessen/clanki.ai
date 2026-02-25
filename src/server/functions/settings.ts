import type { ProviderAuthMethod } from "@opencode-ai/sdk";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, lt } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@/server/db/schema";
import {
  inspectProviderAuthFromSandbox,
  readProviderAuthFromSandbox,
} from "@/server/lib/opencode-auth";
import {
  DEFAULT_OPENCODE_PROVIDER,
  isSupportedOpencodeProvider,
  PROVIDER_OAUTH_ATTEMPT_TTL_MS,
  type SupportedOpencodeProvider,
} from "@/server/lib/opencode";
import {
  deleteProviderCredential as deleteProviderCredentialDb,
  upsertProviderApiKeyCredential,
  upsertProviderAuthCredential,
} from "@/server/lib/provider-credentials";
import { getOpenCodeClient, getTaskSandbox } from "@/server/lib/sandbox";
import { authMiddleware } from "../middleware";
import { badRequest, internalError } from "./common";

const OAUTH_WORKDIR = "/vercel/sandbox";

function parseProvider(value: string): SupportedOpencodeProvider | null {
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return DEFAULT_OPENCODE_PROVIDER;
  }

  return isSupportedOpencodeProvider(normalized) ? normalized : null;
}

function pickOAuthMethod(methods: ProviderAuthMethod[]): number | null {
  let firstOauth: number | null = null;

  for (const [index, method] of methods.entries()) {
    if (method.type !== "oauth") {
      continue;
    }

    if (firstOauth === null) {
      firstOauth = index;
    }

    const label = method.label.toLowerCase();
    if (label.includes("headless")) {
      return index;
    }
  }

  return firstOauth;
}

function extractErrorMessage(error: unknown): string | null {
  if (!error) {
    return null;
  }

  if (typeof error === "string") {
    const normalized = error.trim();
    return normalized.length > 0 ? normalized : null;
  }

  if (error instanceof Error) {
    const normalized = error.message.trim();
    return normalized.length > 0 ? normalized : null;
  }

  if (typeof error === "object" && error !== null) {
    const record = error as { message?: unknown; detail?: unknown; error?: unknown };
    for (const candidate of [record.message, record.detail, record.error]) {
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
  }

  return null;
}

function toProviderOauthCallbackError(error: unknown): string {
  const message = extractErrorMessage(error) ?? "Provider OAuth callback failed";
  if (message.includes("ProviderAuthOauthCodeMissing")) {
    return "Provider OAuth callback requires an authorization code.";
  }
  if (message.includes("ProviderAuthOauthMissing")) {
    return "Provider OAuth attempt expired or was lost. Start the OAuth flow again.";
  }
  if (message.includes("ProviderAuthOauthCallbackFailed")) {
    return "Provider OAuth callback failed. Complete sign-in in the provider page and retry.";
  }
  return message;
}

function toCredentialPersistError(error: unknown): string {
  const message = extractErrorMessage(error);
  if (!message) {
    return "Failed to save provider credentials";
  }
  if (message.includes("CREDENTIALS_ENCRYPTION_KEY")) {
    return "CREDENTIALS_ENCRYPTION_KEY is missing or invalid in the worker environment.";
  }
  return message;
}

export const upsertProviderCredential = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ provider: z.string(), apiKey: z.string() }))
  .handler(async ({ data: input, context }) => {
    const provider = parseProvider(input.provider);
    if (!provider) {
      badRequest("Unsupported provider");
    }

    const apiKey = input.apiKey.trim();
    if (apiKey.length === 0) {
      badRequest("apiKey is required");
    }

    return upsertProviderApiKeyCredential(
      context.db,
      context.env,
      context.session.user.id,
      provider,
      apiKey,
    );
  });

export const deleteProviderCredential = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ provider: z.string() }))
  .handler(async ({ data: input, context }) => {
    const provider = parseProvider(input.provider);
    if (!provider) {
      badRequest("Unsupported provider");
    }

    const db = context.db;
    const userId = context.session.user.id;

    await deleteProviderCredentialDb(db, userId, provider);
    await db
      .delete(schema.userProviderOauthAttempts)
      .where(
        and(
          eq(schema.userProviderOauthAttempts.userId, userId),
          eq(schema.userProviderOauthAttempts.provider, provider),
        ),
      );

    return { provider, configured: false, authType: null, updatedAt: null };
  });

export const startProviderOauth = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ provider: z.string() }))
  .handler(async ({ data: input, context }) => {
    const provider = parseProvider(input.provider);
    if (!provider) {
      badRequest("Unsupported provider");
    }

    const requestId = crypto.randomUUID();
    const userId = context.session.user.id;
    console.info("Provider OAuth start requested", { requestId, userId, provider });

    const sandbox = await getTaskSandbox(context.env, null);
    const sandboxId = sandbox.sandboxId;
    const { client } = await getOpenCodeClient(sandbox, OAUTH_WORKDIR);

    const methodsResponse = await client.provider.auth();
    const methods = methodsResponse.data?.[provider] ?? [];
    const oauthMethod = pickOAuthMethod(methods);
    if (oauthMethod === null) {
      badRequest(`No OAuth method available for ${provider}`);
    }

    const authorizeResponse = await client.provider.oauth.authorize({
      path: { id: provider },
      body: { method: oauthMethod },
    });

    const authorization = authorizeResponse.data;
    if (!authorization?.url) {
      internalError("Failed to start provider OAuth flow");
    }

    const now = Date.now();
    const attemptId = crypto.randomUUID();
    const expiresAt = now + PROVIDER_OAUTH_ATTEMPT_TTL_MS;

    const db = context.db;
    await db
      .delete(schema.userProviderOauthAttempts)
      .where(
        and(
          eq(schema.userProviderOauthAttempts.userId, userId),
          eq(schema.userProviderOauthAttempts.provider, provider),
        ),
      );

    await db.insert(schema.userProviderOauthAttempts).values({
      id: attemptId,
      userId,
      provider,
      sandboxId,
      method: oauthMethod,
      createdAt: now,
      expiresAt,
    });

    return {
      attemptId,
      url: authorization.url,
      instructions: authorization.instructions,
      method: authorization.method,
      expiresAt,
    };
  });

export const completeProviderOauth = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      provider: z.string(),
      attemptId: z.string(),
      code: z.string().optional(),
    }),
  )
  .handler(async ({ data: input, context }) => {
    const provider = parseProvider(input.provider);
    if (!provider) {
      badRequest("Unsupported provider");
    }

    const userId = context.session.user.id;
    const attemptId = input.attemptId.trim();
    if (attemptId.length === 0) {
      badRequest("attemptId is required");
    }
    const code = input.code?.trim() ?? "";
    const requestId = crypto.randomUUID();
    const db = context.db;

    await db
      .delete(schema.userProviderOauthAttempts)
      .where(lt(schema.userProviderOauthAttempts.expiresAt, Date.now()));

    const attempt = await db.query.userProviderOauthAttempts.findFirst({
      where: and(
        eq(schema.userProviderOauthAttempts.id, attemptId),
        eq(schema.userProviderOauthAttempts.userId, userId),
        eq(schema.userProviderOauthAttempts.provider, provider),
      ),
    });
    if (!attempt) {
      badRequest("OAuth attempt not found or expired");
    }

    const sandbox = await getTaskSandbox(context.env, attempt.sandboxId);
    const { client } = await getOpenCodeClient(sandbox, OAUTH_WORKDIR);

    let callbackResponse: Awaited<ReturnType<typeof client.provider.oauth.callback>>;
    try {
      callbackResponse = await client.provider.oauth.callback({
        path: { id: provider },
        body: code.length > 0 ? { method: attempt.method, code } : { method: attempt.method },
      });
    } catch (error) {
      badRequest(toProviderOauthCallbackError(error));
    }

    const callbackError = extractErrorMessage((callbackResponse as { error?: unknown }).error);
    if (!callbackResponse.data) {
      if (callbackError) {
        badRequest(toProviderOauthCallbackError(callbackError));
      }

      badRequest("Provider OAuth callback did not complete");
    }

    const providerAuth = await readProviderAuthFromSandbox(sandbox, provider);
    if (!providerAuth) {
      const inspection = await inspectProviderAuthFromSandbox(sandbox, provider);
      console.error("Provider OAuth callback succeeded but auth token not found", {
        requestId,
        userId,
        provider,
        attemptId: attempt.id,
        inspection,
      });
      internalError(
        "Provider OAuth completed but no auth token was found in the OpenCode sandbox. Start OAuth again and retry completion.",
      );
    }

    let status;
    try {
      status = await upsertProviderAuthCredential(db, context.env, userId, provider, providerAuth);
    } catch (error) {
      internalError(toCredentialPersistError(error));
    }

    await db
      .delete(schema.userProviderOauthAttempts)
      .where(eq(schema.userProviderOauthAttempts.id, attempt.id));

    return status;
  });

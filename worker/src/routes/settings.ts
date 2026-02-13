import type { Sandbox } from "@cloudflare/sandbox";
import { and, eq, lt } from "drizzle-orm";
import { Hono } from "hono";
import type { ProviderAuthMethod } from "@opencode-ai/sdk";
import type { AppDb } from "../db/client";
import * as schema from "../db/schema";
import { inspectProviderAuthFromSandbox, readProviderAuthFromSandbox } from "../lib/opencode-auth";
import {
  buildProviderAuthSandboxId,
  DEFAULT_OPENCODE_PROVIDER,
  isSupportedOpencodeProvider,
  PROVIDER_OAUTH_ATTEMPT_TTL_MS,
  type SupportedOpencodeProvider,
} from "../lib/opencode";
import {
  deleteProviderCredential,
  getProviderCredentialStatus,
  upsertProviderApiKeyCredential,
  upsertProviderAuthCredential,
} from "../lib/provider-credentials";
import { getOpenCodeClient, getTaskSandbox } from "../lib/sandbox";
import type { SecretCryptoEnv } from "../lib/secret-crypto";

const OAUTH_WORKDIR = "/home/user";

type Env = {
  Bindings: {
    HYPERDRIVE: Hyperdrive;
    Sandbox: DurableObjectNamespace<Sandbox>;
  } & SecretCryptoEnv;
  Variables: {
    db: AppDb;
    session: {
      session: { userId: string; activeOrganizationId?: string | null };
      user: { id: string; name: string; email: string; image?: string | null };
    };
  };
};

const settings = new Hono<Env>();

settings.get("/providers/:provider", async (c) => {
  const db = c.get("db");
  const userId = c.get("session").user.id;
  const provider = parseProvider(c.req.param("provider"));

  if (!provider) {
    return c.json({ error: "Unsupported provider" }, 400);
  }

  const status = await getProviderCredentialStatus(db, userId, provider);
  return c.json(status);
});

settings.put("/providers/:provider", async (c) => {
  const db = c.get("db");
  const userId = c.get("session").user.id;
  const provider = parseProvider(c.req.param("provider"));

  if (!provider) {
    return c.json({ error: "Unsupported provider" }, 400);
  }

  let body: { apiKey?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const apiKey = body.apiKey?.trim() ?? "";
  if (apiKey.length === 0) {
    return c.json({ error: "apiKey is required" }, 400);
  }

  const status = await upsertProviderApiKeyCredential(db, c.env, userId, provider, apiKey);
  return c.json(status);
});

settings.post("/providers/:provider/oauth/start", async (c) => {
  const db = c.get("db");
  const userId = c.get("session").user.id;
  const provider = parseProvider(c.req.param("provider"));
  const requestId = crypto.randomUUID();

  if (!provider) {
    return c.json({ error: "Unsupported provider" }, 400);
  }
  console.info("Provider OAuth start requested", { requestId, userId, provider });

  const sandboxId = buildProviderAuthSandboxId({ userId, provider });
  const sandbox = getTaskSandbox(c.env, sandboxId);
  const { client } = await getOpenCodeClient(sandbox, OAUTH_WORKDIR, undefined, {
    restartServer: false,
  });

  const methodsResponse = await client.provider.auth();
  const methods = methodsResponse.data?.[provider] ?? [];
  const oauthMethod = pickOAuthMethod(methods);
  console.info("Provider OAuth methods resolved", {
    requestId,
    userId,
    provider,
    methodCount: methods.length,
    selectedMethod: oauthMethod,
    methodLabels: methods.map((method) => `${method.type}:${method.label}`),
  });
  if (oauthMethod === null) {
    return c.json({ error: `No OAuth method available for ${provider}` }, 400);
  }

  const authorizeResponse = await client.provider.oauth.authorize({
    path: { id: provider },
    body: { method: oauthMethod },
  });

  const authorization = authorizeResponse.data;
  if (!authorization?.url) {
    console.warn("Provider OAuth authorize response missing URL", {
      requestId,
      userId,
      provider,
      selectedMethod: oauthMethod,
    });
    return c.json({ error: "Failed to start provider OAuth flow" }, 500);
  }

  const now = Date.now();
  const attemptId = crypto.randomUUID();
  const expiresAt = now + PROVIDER_OAUTH_ATTEMPT_TTL_MS;

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
  console.info("Provider OAuth attempt created", {
    requestId,
    userId,
    provider,
    attemptId,
    sandboxId,
    selectedMethod: oauthMethod,
    authorizationMethod: authorization.method,
    expiresAt,
  });

  return c.json({
    attemptId,
    url: authorization.url,
    instructions: authorization.instructions,
    method: authorization.method,
    expiresAt,
  });
});

settings.post("/providers/:provider/oauth/complete", async (c) => {
  const db = c.get("db");
  const userId = c.get("session").user.id;
  const provider = parseProvider(c.req.param("provider"));
  const requestId = crypto.randomUUID();

  if (!provider) {
    return c.json({ error: "Unsupported provider" }, 400);
  }

  let body: { attemptId?: string; code?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const attemptId = body.attemptId?.trim() ?? "";
  if (attemptId.length === 0) {
    return c.json({ error: "attemptId is required" }, 400);
  }
  const code = body.code?.trim() ?? "";
  console.info("Provider OAuth completion requested", {
    requestId,
    userId,
    provider,
    attemptId,
    hasCode: code.length > 0,
  });

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
    console.warn("Provider OAuth attempt missing on completion", {
      requestId,
      userId,
      provider,
      attemptId,
    });
    return c.json({ error: "OAuth attempt not found or expired" }, 400);
  }
  console.info("Provider OAuth attempt loaded for completion", {
    requestId,
    userId,
    provider,
    attemptId: attempt.id,
    sandboxId: attempt.sandboxId,
    method: attempt.method,
    expiresAt: attempt.expiresAt,
  });

  const sandbox = getTaskSandbox(c.env, attempt.sandboxId);
  const { client } = await getOpenCodeClient(sandbox, OAUTH_WORKDIR, undefined, {
    restartServer: false,
  });

  let callbackResponse: Awaited<ReturnType<typeof client.provider.oauth.callback>>;
  try {
    callbackResponse = await client.provider.oauth.callback({
      path: { id: provider },
      body: code.length > 0 ? { method: attempt.method, code } : { method: attempt.method },
    });
  } catch (error) {
    console.warn("Provider OAuth callback request failed", {
      requestId,
      userId,
      provider,
      attemptId: attempt.id,
      method: attempt.method,
      error: extractErrorMessage(error),
    });
    return c.json({ error: toProviderOauthCallbackError(error) }, 400);
  }

  const callbackError = extractErrorMessage((callbackResponse as { error?: unknown }).error);
  console.info("Provider OAuth callback returned", {
    requestId,
    userId,
    provider,
    attemptId: attempt.id,
    callbackSucceeded: Boolean(callbackResponse.data),
    callbackError,
  });
  if (!callbackResponse.data) {
    if (callbackError) {
      return c.json({ error: toProviderOauthCallbackError(callbackError) }, 400);
    }

    return c.json({ error: "Provider OAuth callback did not complete" }, 400);
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
    return c.json(
      {
        error:
          "Provider OAuth completed but no auth token was found in the OpenCode sandbox. Start OAuth again and retry completion.",
      },
      500,
    );
  }

  let status;
  try {
    status = await upsertProviderAuthCredential(db, c.env, userId, provider, providerAuth);
  } catch (error) {
    const message = toCredentialPersistError(error);
    console.error("Failed to persist provider OAuth credential", {
      userId,
      provider,
      message,
    });
    return c.json({ error: message }, 500);
  }
  console.info("Provider OAuth credentials persisted", {
    requestId,
    userId,
    provider,
    attemptId: attempt.id,
    authType: providerAuth.type,
  });

  await db
    .delete(schema.userProviderOauthAttempts)
    .where(eq(schema.userProviderOauthAttempts.id, attempt.id));
  console.info("Provider OAuth attempt cleared after completion", {
    requestId,
    userId,
    provider,
    attemptId: attempt.id,
  });

  return c.json(status);
});

settings.delete("/providers/:provider", async (c) => {
  const db = c.get("db");
  const userId = c.get("session").user.id;
  const provider = parseProvider(c.req.param("provider"));

  if (!provider) {
    return c.json({ error: "Unsupported provider" }, 400);
  }

  await deleteProviderCredential(db, userId, provider);
  await db
    .delete(schema.userProviderOauthAttempts)
    .where(
      and(
        eq(schema.userProviderOauthAttempts.userId, userId),
        eq(schema.userProviderOauthAttempts.provider, provider),
      ),
    );

  return c.json({ provider, configured: false, authType: null, updatedAt: null });
});

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

export { settings };

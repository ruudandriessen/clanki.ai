import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  DEFAULT_OPENCODE_PROVIDER,
  isSupportedOpencodeProvider,
  type SupportedOpencodeProvider,
} from "@/server/lib/opencode";
import {
  deleteProviderCredential as deleteProviderCredentialDb,
  upsertProviderApiKeyCredential,
} from "@/server/lib/provider-credentials";
import { authMiddleware } from "../middleware";
import { badRequest } from "./common";

function parseProvider(value: string): SupportedOpencodeProvider | null {
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return DEFAULT_OPENCODE_PROVIDER;
  }

  return isSupportedOpencodeProvider(normalized) ? normalized : null;
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
    return { provider, configured: false, authType: null, updatedAt: null };
  });

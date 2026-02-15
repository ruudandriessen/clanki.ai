import { oc, z } from "./common";

export const providerCredentialStatusSchema = z.object({
  provider: z.string(),
  configured: z.boolean(),
  authType: z.enum(["api", "oauth", "wellknown"]).nullable(),
  updatedAt: z.number().nullable(),
});

export const providerOauthStartSchema = z.object({
  attemptId: z.string(),
  url: z.string(),
  instructions: z.string(),
  method: z.enum(["auto", "code"]),
  expiresAt: z.number(),
});

export const settingsContract = {
  getProviderCredentialStatus: oc
    .input(
      z.object({
        provider: z.string(),
      }),
    )
    .output(providerCredentialStatusSchema),
  upsertProviderCredential: oc
    .input(
      z.object({
        provider: z.string(),
        apiKey: z.string(),
      }),
    )
    .output(providerCredentialStatusSchema),
  deleteProviderCredential: oc
    .input(
      z.object({
        provider: z.string(),
      }),
    )
    .output(providerCredentialStatusSchema),
  startProviderOauth: oc
    .input(
      z.object({
        provider: z.string(),
      }),
    )
    .output(providerOauthStartSchema),
  completeProviderOauth: oc
    .input(
      z.object({
        provider: z.string(),
        attemptId: z.string(),
        code: z.string().optional(),
      }),
    )
    .output(providerCredentialStatusSchema),
};

export type ProviderCredentialStatus = z.infer<typeof providerCredentialStatusSchema>;
export type ProviderOauthStart = z.infer<typeof providerOauthStartSchema>;

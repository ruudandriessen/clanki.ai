export const DEFAULT_OPENCODE_PROVIDER = "openai";
export const DEFAULT_OPENCODE_MODEL = "gpt-5.3-codex";
const OPENCODE_AUTH_FILE_PATH = "/home/user/.local/share/opencode/auth.json";
export const OPENCODE_AUTH_FILE_FALLBACK_PATHS = [
  OPENCODE_AUTH_FILE_PATH,
  "/root/.local/share/opencode/auth.json",
  "/home/sandbox/.local/share/opencode/auth.json",
  "/home/vercel-sandbox/.local/share/opencode/auth.json",
  "/vercel/sandbox/.local/share/opencode/auth.json",
] as const;
export const PROVIDER_OAUTH_ATTEMPT_TTL_MS = 15 * 60 * 1000;

export const SUPPORTED_OPENCODE_PROVIDERS = [DEFAULT_OPENCODE_PROVIDER] as const;

export type SupportedOpencodeProvider = (typeof SUPPORTED_OPENCODE_PROVIDERS)[number];

export function isSupportedOpencodeProvider(value: string): value is SupportedOpencodeProvider {
  return SUPPORTED_OPENCODE_PROVIDERS.includes(value as SupportedOpencodeProvider);
}

export function toProviderModelRef(provider: string, model: string): string {
  return `${provider}/${model}`;
}

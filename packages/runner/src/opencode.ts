export const DEFAULT_OPENCODE_PROVIDER = "openai";
export const DEFAULT_OPENCODE_MODEL = "gpt-5.3-codex";

export const SUPPORTED_OPENCODE_PROVIDERS = [DEFAULT_OPENCODE_PROVIDER] as const;

export type SupportedOpencodeProvider = (typeof SUPPORTED_OPENCODE_PROVIDERS)[number];

export function isSupportedOpencodeProvider(value: string): value is SupportedOpencodeProvider {
  return SUPPORTED_OPENCODE_PROVIDERS.includes(value as SupportedOpencodeProvider);
}

export function toProviderModelRef(provider: string, model: string): string {
  return `${provider}/${model}`;
}

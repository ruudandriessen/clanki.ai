export const DEFAULT_OPENCODE_PROVIDER = "openai";
export const DEFAULT_OPENCODE_MODEL = "gpt-5.3-codex";

export function toOpencodeModelRef(provider: string, model: string): string {
  return `${provider}/${model}`;
}

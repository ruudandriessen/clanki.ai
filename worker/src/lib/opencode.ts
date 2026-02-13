export const DEFAULT_OPENCODE_PROVIDER = "openai";
export const DEFAULT_OPENCODE_MODEL = "gpt-5.3-codex";
const OPENCODE_AUTH_FILE_PATH = "/home/user/.local/share/opencode/auth.json";
export const OPENCODE_AUTH_FILE_FALLBACK_PATHS = [
  OPENCODE_AUTH_FILE_PATH,
  "/root/.local/share/opencode/auth.json",
  "/home/sandbox/.local/share/opencode/auth.json",
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

export function buildTaskRunSandboxId(args: {
  taskId: string;
  userId: string;
  provider: string;
  model: string;
}): string {
  return buildBoundedSandboxId("task-run", [args.taskId, args.userId, args.provider, args.model]);
}

export function buildProviderAuthSandboxId(args: { userId: string; provider: string }): string {
  return buildBoundedSandboxId("provider-auth", [args.userId, args.provider]);
}

function buildBoundedSandboxId(prefix: string, parts: string[]): string {
  const raw = [prefix, ...parts].join(":");
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const hash = toFnv1aHex(raw);
  const maxSlugLength = 63 - hash.length - 1;
  const trimmedSlug = slug.slice(0, Math.max(1, maxSlugLength)).replace(/-+$/g, "");
  return `${trimmedSlug || "sandbox"}-${hash}`;
}

function toFnv1aHex(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

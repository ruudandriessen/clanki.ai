import type { Auth } from "@opencode-ai/sdk";
import type { Sandbox } from "@cloudflare/sandbox";
import { OPENCODE_AUTH_FILE_FALLBACK_PATHS } from "./opencode";

export type ProviderAuthSandboxInspection = {
  provider: string;
  paths: Array<{
    path: string;
    exists: boolean;
    parseError: boolean;
    keys: string[];
    matchedProvider: boolean;
    hasUniqueAuthCandidate: boolean;
  }>;
};

export async function readProviderAuthFromSandbox(
  sandbox: Sandbox,
  provider: string,
): Promise<Auth | null> {
  const providerId = provider.trim().toLowerCase();
  let singleAuthCandidate: Auth | null = null;

  for (const authPath of OPENCODE_AUTH_FILE_FALLBACK_PATHS) {
    const exists = await sandbox.exists(authPath);
    if (!exists.exists) {
      continue;
    }

    const authFile = await sandbox.readFile(authPath);
    const parsed = parseJsonRecord(authFile.content);

    const exactMatch = findProviderAuth(parsed, providerId);
    if (exactMatch) {
      return exactMatch;
    }

    const uniqueMatch = findUniqueAuth(parsed);
    if (uniqueMatch && !singleAuthCandidate) {
      singleAuthCandidate = uniqueMatch;
    }
  }

  return singleAuthCandidate;
}

export async function inspectProviderAuthFromSandbox(
  sandbox: Sandbox,
  provider: string,
): Promise<ProviderAuthSandboxInspection> {
  const providerId = provider.trim().toLowerCase();
  const paths: ProviderAuthSandboxInspection["paths"] = [];

  for (const authPath of OPENCODE_AUTH_FILE_FALLBACK_PATHS) {
    const exists = await sandbox.exists(authPath);
    if (!exists.exists) {
      paths.push({
        path: authPath,
        exists: false,
        parseError: false,
        keys: [],
        matchedProvider: false,
        hasUniqueAuthCandidate: false,
      });
      continue;
    }

    const authFile = await sandbox.readFile(authPath);
    const parsed = parseJsonRecordDetailed(authFile.content);
    const matchedProvider = findProviderAuth(parsed.record, providerId) !== null;
    const hasUniqueAuthCandidate = findUniqueAuth(parsed.record) !== null;

    paths.push({
      path: authPath,
      exists: true,
      parseError: parsed.parseError,
      keys: Object.keys(parsed.record),
      matchedProvider,
      hasUniqueAuthCandidate,
    });
  }

  return {
    provider: providerId,
    paths,
  };
}

function parseJsonRecord(value: string): Record<string, unknown> {
  return parseJsonRecordDetailed(value).record;
}

function parseJsonRecordDetailed(value: string): {
  record: Record<string, unknown>;
  parseError: boolean;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { record: {}, parseError: true };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { record: {}, parseError: false };
  }

  return { record: parsed as Record<string, unknown>, parseError: false };
}

function findProviderAuth(record: Record<string, unknown>, providerId: string): Auth | null {
  const exact = record[providerId];
  if (isAuth(exact)) {
    return exact;
  }

  for (const [key, value] of Object.entries(record)) {
    const normalizedKey = key.trim().toLowerCase();
    if (
      normalizedKey === providerId ||
      normalizedKey.startsWith(`${providerId}:`) ||
      normalizedKey.endsWith(`:${providerId}`) ||
      normalizedKey.startsWith(`${providerId}/`) ||
      normalizedKey.endsWith(`/${providerId}`)
    ) {
      if (isAuth(value)) {
        return value;
      }
    }
  }

  return null;
}

function findUniqueAuth(record: Record<string, unknown>): Auth | null {
  let auth: Auth | null = null;

  for (const value of Object.values(record)) {
    if (!isAuth(value)) {
      continue;
    }

    if (auth) {
      return null;
    }
    auth = value;
  }

  return auth;
}

function isAuth(value: unknown): value is Auth {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("type" in value)) {
    return false;
  }

  const type = (value as { type?: unknown }).type;
  if (type === "api") {
    return typeof (value as { key?: unknown }).key === "string";
  }

  if (type === "oauth") {
    return (
      typeof (value as { access?: unknown }).access === "string" &&
      typeof (value as { refresh?: unknown }).refresh === "string" &&
      typeof (value as { expires?: unknown }).expires === "number"
    );
  }

  if (type === "wellknown") {
    return (
      typeof (value as { key?: unknown }).key === "string" &&
      typeof (value as { token?: unknown }).token === "string"
    );
  }

  return false;
}

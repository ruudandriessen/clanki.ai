import type { SessionContext } from "../middleware";

export function getOrgId(context: { session: SessionContext }): string | null {
  return context.session.session.activeOrganizationId ?? null;
}

export function parseOptionalId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseOptionalTimestamp(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  if (value < 0) {
    return undefined;
  }

  return Math.trunc(value);
}

export function badRequest(message: string): never {
  throw new Error(message);
}

export function notFound(message: string): never {
  throw new Error(message);
}

export function forbidden(message: string): never {
  throw new Error(message);
}

export function conflict(message: string): never {
  throw new Error(message);
}

export function badGateway(message: string): never {
  throw new Error(message);
}

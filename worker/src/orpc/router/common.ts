import { ORPCError } from "@orpc/server";
import type { OrpcContext } from "./context";

export function getOrgId(context: OrpcContext): string | null {
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

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ORPCError) {
    return error.message;
  }

  if (error instanceof Error) {
    const trimmed = error.message.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return fallback;
}

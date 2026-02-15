import { ORPCError } from "@orpc/server";

export function badRequest(message: string): never {
  throw new ORPCError("BAD_REQUEST", { message });
}

export function notFound(message: string): never {
  throw new ORPCError("NOT_FOUND", { message });
}

export function forbidden(message: string): never {
  throw new ORPCError("FORBIDDEN", { message });
}

export function conflict(message: string): never {
  throw new ORPCError("CONFLICT", { message });
}

export function badGateway(message: string): never {
  throw new ORPCError("BAD_GATEWAY", { message });
}

export function internalError(message: string): never {
  throw new ORPCError("INTERNAL_SERVER_ERROR", { message });
}

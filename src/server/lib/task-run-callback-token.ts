import { createHmac, timingSafeEqual } from "node:crypto";
import { getTaskRunnerCallbackSecret, type AppEnv } from "@/server/env";

export type TaskRunCallbackClaims = {
  executionId: string;
  taskId: string;
  organizationId: string;
  userId: string;
  provider: string;
  issuedAt: number;
};

export function createTaskRunCallbackToken(claims: TaskRunCallbackClaims, env: AppEnv): string {
  const encodedPayload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = signPayload(encodedPayload, getTaskRunnerCallbackSecret(env));
  return `${encodedPayload}.${signature}`;
}

export function verifyTaskRunCallbackToken(
  token: string,
  env: AppEnv,
): TaskRunCallbackClaims | null {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, encodedSignature] = parts;
  if (!encodedPayload || !encodedSignature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload, getTaskRunnerCallbackSecret(env));
  const provided = Buffer.from(encodedSignature);
  const expected = Buffer.from(expectedSignature);

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return null;
  }

  if (!isTaskRunCallbackClaims(parsed)) {
    return null;
  }

  return parsed;
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function isTaskRunCallbackClaims(value: unknown): value is TaskRunCallbackClaims {
  if (!value || typeof value !== "object") {
    return false;
  }

  const claims = value as Partial<TaskRunCallbackClaims>;

  return (
    typeof claims.executionId === "string" &&
    claims.executionId.trim().length > 0 &&
    typeof claims.taskId === "string" &&
    claims.taskId.trim().length > 0 &&
    typeof claims.organizationId === "string" &&
    claims.organizationId.trim().length > 0 &&
    typeof claims.userId === "string" &&
    claims.userId.trim().length > 0 &&
    typeof claims.provider === "string" &&
    claims.provider.trim().length > 0 &&
    typeof claims.issuedAt === "number" &&
    Number.isFinite(claims.issuedAt)
  );
}

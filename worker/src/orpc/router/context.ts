import type { Sandbox } from "@cloudflare/sandbox";
import { implement } from "@orpc/server";
import { apiContract } from "../../../../shared/orpc/contract";
import type { AppDb } from "../../db/client";
import type { SecretCryptoEnv } from "../../lib/secret-crypto";

export type Bindings = {
  HYPERDRIVE: Hyperdrive;
  DATABASE_URL?: string;
  Sandbox: DurableObjectNamespace<Sandbox>;
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  CREDENTIALS_ENCRYPTION_KEY: string;
  DURABLE_STREAMS_SERVICE_ID?: string;
  DURABLE_STREAMS_SECRET?: string;
} & SecretCryptoEnv;

export type SessionContext = {
  session: { userId: string; activeOrganizationId?: string | null };
  user: { id: string; name: string; email: string; image?: string | null };
};

export type OrpcContext = {
  db: AppDb;
  env: Bindings;
  session: SessionContext;
  executionCtx: ExecutionContext;
};

export const os = implement(apiContract).$context<OrpcContext>();

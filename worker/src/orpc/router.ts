import type { Sandbox } from "@cloudflare/sandbox";
import type { ProviderAuthMethod } from "@opencode-ai/sdk";
import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { ORPCError, implement } from "@orpc/server";
import { apiContract } from "../../../shared/orpc/contract";
import type { AppDb } from "../db/client";
import { getDb } from "../db/client";
import { withTransaction } from "../db/transaction";
import * as schema from "../db/schema";
import { executeTaskRun } from "../lib/task-runs";
import { inspectProviderAuthFromSandbox, readProviderAuthFromSandbox } from "../lib/opencode-auth";
import {
  buildProviderAuthSandboxId,
  DEFAULT_OPENCODE_MODEL,
  DEFAULT_OPENCODE_PROVIDER,
  isSupportedOpencodeProvider,
  PROVIDER_OAUTH_ATTEMPT_TTL_MS,
  type SupportedOpencodeProvider,
} from "../lib/opencode";
import {
  deleteProviderCredential,
  getProviderCredentialStatus,
  upsertProviderApiKeyCredential,
  upsertProviderAuthCredential,
} from "../lib/provider-credentials";
import { getOpenCodeClient, getTaskSandbox } from "../lib/sandbox";
import type { SecretCryptoEnv } from "../lib/secret-crypto";

const OAUTH_WORKDIR = "/home/user";

type Bindings = {
  HYPERDRIVE: Hyperdrive;
  DATABASE_URL?: string;
  Sandbox: DurableObjectNamespace<Sandbox>;
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  CREDENTIALS_ENCRYPTION_KEY: string;
  DURABLE_STREAMS_SERVICE_ID?: string;
  DURABLE_STREAMS_SECRET?: string;
} & SecretCryptoEnv;

type SessionContext = {
  session: { userId: string; activeOrganizationId?: string | null };
  user: { id: string; name: string; email: string; image?: string | null };
};

type OrpcContext = {
  db: AppDb;
  env: Bindings;
  session: SessionContext;
  executionCtx: ExecutionContext;
};

const os = implement(apiContract).$context<OrpcContext>();

function getOrgId(context: OrpcContext): string | null {
  return context.session.session.activeOrganizationId ?? null;
}

function parseOptionalId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseOptionalTimestamp(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  if (value < 0) {
    return undefined;
  }

  return Math.trunc(value);
}

function parseProvider(value: string): SupportedOpencodeProvider | null {
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return DEFAULT_OPENCODE_PROVIDER;
  }

  return isSupportedOpencodeProvider(normalized) ? normalized : null;
}

function badRequest(message: string): never {
  throw new ORPCError("BAD_REQUEST", { message });
}

function notFound(message: string): never {
  throw new ORPCError("NOT_FOUND", { message });
}

function forbidden(message: string): never {
  throw new ORPCError("FORBIDDEN", { message });
}

function conflict(message: string): never {
  throw new ORPCError("CONFLICT", { message });
}

function badGateway(message: string): never {
  throw new ORPCError("BAD_GATEWAY", { message });
}

function internalError(message: string): never {
  throw new ORPCError("INTERNAL_SERVER_ERROR", { message });
}

async function getTaskForOrg(
  db: AppDb,
  taskId: string,
  orgId: string,
): Promise<{ id: string; title: string; projectId: string | null } | undefined> {
  return db.query.tasks.findFirst({
    where: and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, orgId)),
    columns: { id: true, title: true, projectId: true },
  });
}

async function getLatestTaskMessageTimestamp(db: AppDb, taskId: string): Promise<number | null> {
  const latest = await db.query.taskMessages.findFirst({
    where: eq(schema.taskMessages.taskId, taskId),
    columns: { createdAt: true },
    orderBy: desc(schema.taskMessages.createdAt),
  });

  return latest?.createdAt ?? null;
}

function pickOAuthMethod(methods: ProviderAuthMethod[]): number | null {
  let firstOauth: number | null = null;

  for (const [index, method] of methods.entries()) {
    if (method.type !== "oauth") {
      continue;
    }

    if (firstOauth === null) {
      firstOauth = index;
    }

    const label = method.label.toLowerCase();
    if (label.includes("headless")) {
      return index;
    }
  }

  return firstOauth;
}

function extractErrorMessage(error: unknown): string | null {
  if (!error) {
    return null;
  }

  if (typeof error === "string") {
    const normalized = error.trim();
    return normalized.length > 0 ? normalized : null;
  }

  if (error instanceof Error) {
    const normalized = error.message.trim();
    return normalized.length > 0 ? normalized : null;
  }

  if (typeof error === "object" && error !== null) {
    const record = error as { message?: unknown; detail?: unknown; error?: unknown };
    for (const candidate of [record.message, record.detail, record.error]) {
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
  }

  return null;
}

function toProviderOauthCallbackError(error: unknown): string {
  const message = extractErrorMessage(error) ?? "Provider OAuth callback failed";
  if (message.includes("ProviderAuthOauthCodeMissing")) {
    return "Provider OAuth callback requires an authorization code.";
  }
  if (message.includes("ProviderAuthOauthMissing")) {
    return "Provider OAuth attempt expired or was lost. Start the OAuth flow again.";
  }
  if (message.includes("ProviderAuthOauthCallbackFailed")) {
    return "Provider OAuth callback failed. Complete sign-in in the provider page and retry.";
  }
  return message;
}

function toCredentialPersistError(error: unknown): string {
  const message = extractErrorMessage(error);
  if (!message) {
    return "Failed to save provider credentials";
  }
  if (message.includes("CREDENTIALS_ENCRYPTION_KEY")) {
    return "CREDENTIALS_ENCRYPTION_KEY is missing or invalid in the worker environment.";
  }
  return message;
}

function getErrorMessage(error: unknown, fallback: string): string {
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

export const orpcRouter = os.router({
  installations: {
    list: os.installations.list.handler(async ({ context }) => {
      const db = context.db;
      const userId = context.session.session.userId;

      const githubAccount = await db.query.account.findFirst({
        where: and(eq(schema.account.providerId, "github"), eq(schema.account.userId, userId)),
      });

      if (!githubAccount?.accessToken) {
        return [];
      }

      const ghRes = await fetch("https://api.github.com/user/installations", {
        headers: {
          Authorization: `Bearer ${githubAccount.accessToken}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "clanki-worker",
        },
      });

      if (!ghRes.ok) {
        badGateway("Failed to fetch GitHub installations");
      }

      const ghData = (await ghRes.json()) as {
        installations: Array<{
          id: number;
          account: { login: string; type: string };
        }>;
      };

      const ghInstallationIds = ghData.installations.map((installation) => installation.id);
      if (ghInstallationIds.length === 0) {
        return [];
      }

      return db.query.installations.findMany({
        where: and(
          inArray(schema.installations.installationId, ghInstallationIds),
          isNull(schema.installations.deletedAt),
        ),
      });
    }),
    repos: os.installations.repos.handler(async ({ input, context }) => {
      const db = context.db;
      const userId = context.session.session.userId;

      const githubAccount = await db.query.account.findFirst({
        where: and(eq(schema.account.providerId, "github"), eq(schema.account.userId, userId)),
      });

      if (!githubAccount?.accessToken) {
        badRequest("No GitHub account linked");
      }

      const repos: Array<{
        id: number;
        fullName: string;
        name: string;
        htmlUrl: string;
        private: boolean;
      }> = [];

      let page = 1;
      const perPage = 100;

      while (true) {
        const ghRes = await fetch(
          `https://api.github.com/user/installations/${input.installationId}/repositories?per_page=${perPage}&page=${page}`,
          {
            headers: {
              Authorization: `Bearer ${githubAccount.accessToken}`,
              Accept: "application/vnd.github+json",
              "User-Agent": "clanki-worker",
            },
          },
        );

        if (!ghRes.ok) {
          if (ghRes.status === 403 || ghRes.status === 404) {
            forbidden("Installation not accessible");
          }

          badGateway("Failed to fetch repos from GitHub");
        }

        const data = (await ghRes.json()) as {
          repositories: Array<{
            id: number;
            full_name: string;
            name: string;
            html_url: string;
            private: boolean;
          }>;
          total_count: number;
        };

        for (const repository of data.repositories) {
          repos.push({
            id: repository.id,
            fullName: repository.full_name,
            name: repository.name,
            htmlUrl: repository.html_url,
            private: repository.private,
          });
        }

        if (repos.length >= data.total_count) {
          break;
        }
        page++;
      }

      return repos;
    }),
  },
  projects: {
    create: os.projects.create.handler(async ({ input, context }) => {
      const db = context.db;
      const orgId = getOrgId(context);

      if (!orgId) {
        badRequest("No active organization");
      }

      const result = await withTransaction(db, async (tx, txid) => {
        const repoUrls = input.repos.map((repo) => repo.repoUrl);
        const existing = await tx.query.projects.findMany({
          where: and(
            eq(schema.projects.organizationId, orgId),
            inArray(schema.projects.repoUrl, repoUrls),
          ),
          columns: { repoUrl: true },
        });
        const existingUrls = new Set(existing.map((project) => project.repoUrl));

        const newRepos = input.repos.filter((repo) => !existingUrls.has(repo.repoUrl));
        if (newRepos.length === 0) {
          return { conflict: true as const };
        }

        const now = Date.now();
        const created = newRepos.map((repo) => {
          const createdAt = parseOptionalTimestamp(repo.createdAt) ?? now;
          const updatedAt = parseOptionalTimestamp(repo.updatedAt) ?? createdAt;

          return {
            id: parseOptionalId(repo.id) ?? crypto.randomUUID(),
            organizationId: orgId,
            name: repo.name,
            repoUrl: repo.repoUrl,
            installationId: repo.installationId,
            setupCommand: null,
            createdAt,
            updatedAt,
          };
        });

        await tx.insert(schema.projects).values(created);
        return { data: created, txid };
      });

      if ("conflict" in result) {
        conflict("All selected repos already have projects");
      }

      return result;
    }),
    updateSetupCommand: os.projects.updateSetupCommand.handler(async ({ input, context }) => {
      const db = context.db;
      const orgId = getOrgId(context);

      if (!orgId) {
        badRequest("No active organization");
      }

      const setupCommand =
        typeof input.setupCommand === "string" && input.setupCommand.trim().length > 0
          ? input.setupCommand.trim()
          : null;

      const result = await withTransaction(db, async (tx, txid) => {
        const existing = await tx.query.projects.findFirst({
          where: and(
            eq(schema.projects.id, input.projectId),
            eq(schema.projects.organizationId, orgId),
          ),
          columns: { id: true },
        });

        if (!existing) {
          return { notFound: true as const };
        }

        const updatedAt = Date.now();
        await tx
          .update(schema.projects)
          .set({ setupCommand, updatedAt })
          .where(
            and(eq(schema.projects.id, input.projectId), eq(schema.projects.organizationId, orgId)),
          );

        const updated = await tx.query.projects.findFirst({
          where: and(
            eq(schema.projects.id, input.projectId),
            eq(schema.projects.organizationId, orgId),
          ),
        });

        if (!updated) {
          return { notFound: true as const };
        }

        return { data: updated, txid };
      });

      if ("notFound" in result) {
        notFound("Project not found");
      }

      return result;
    }),
  },
  tasks: {
    create: os.tasks.create.handler(async ({ input, context }) => {
      const db = context.db;
      const orgId = getOrgId(context);

      if (!orgId) {
        badRequest("No active organization");
      }

      if (input.title.trim().length === 0) {
        badRequest("title is required");
      }

      const project = await db.query.projects.findFirst({
        where: and(
          eq(schema.projects.id, input.projectId),
          eq(schema.projects.organizationId, orgId),
        ),
        columns: { id: true },
      });

      if (!project) {
        notFound("Project not found");
      }

      const result = await withTransaction(db, async (tx, txid) => {
        const now = Date.now();
        const createdAt = parseOptionalTimestamp(input.createdAt) ?? now;
        const updatedAt = parseOptionalTimestamp(input.updatedAt) ?? createdAt;
        const status =
          typeof input.status === "string" && input.status.trim().length > 0
            ? input.status.trim()
            : "open";

        const task = {
          id: parseOptionalId(input.id) ?? crypto.randomUUID(),
          organizationId: orgId,
          projectId: input.projectId,
          title: input.title.trim(),
          status,
          createdAt,
          updatedAt,
        };

        await tx.insert(schema.tasks).values(task);
        return { data: task, txid };
      });

      return result;
    }),
    update: os.tasks.update.handler(async ({ input, context }) => {
      const db = context.db;
      const orgId = getOrgId(context);

      if (!orgId) {
        badRequest("No active organization");
      }

      const task = await getTaskForOrg(db, input.taskId, orgId);
      if (!task) {
        notFound("Task not found");
      }

      const title = input.title.trim();
      if (title.length === 0) {
        badRequest("title is required");
      }

      const result = await withTransaction(db, async (tx, txid) => {
        const updatedAt = Date.now();
        await tx
          .update(schema.tasks)
          .set({ title, updatedAt })
          .where(and(eq(schema.tasks.id, input.taskId), eq(schema.tasks.organizationId, orgId)));

        const updatedTask = await tx.query.tasks.findFirst({
          where: and(eq(schema.tasks.id, input.taskId), eq(schema.tasks.organizationId, orgId)),
        });

        if (!updatedTask) {
          return { notFound: true as const };
        }

        return { data: updatedTask, txid };
      });

      if ("notFound" in result) {
        notFound("Task not found");
      }

      return result;
    }),
    delete: os.tasks.delete.handler(async ({ input, context }) => {
      const db = context.db;
      const orgId = getOrgId(context);

      if (!orgId) {
        badRequest("No active organization");
      }

      const task = await getTaskForOrg(db, input.taskId, orgId);
      if (!task) {
        notFound("Task not found");
      }

      const txid = await withTransaction(db, async (tx, currentTxid) => {
        await tx
          .delete(schema.tasks)
          .where(and(eq(schema.tasks.id, input.taskId), eq(schema.tasks.organizationId, orgId)));
        return currentTxid;
      });

      return { txid };
    }),
    createMessage: os.tasks.createMessage.handler(async ({ input, context }) => {
      const db = context.db;
      const orgId = getOrgId(context);

      if (!orgId) {
        badRequest("No active organization");
      }

      const task = await getTaskForOrg(db, input.taskId, orgId);
      if (!task) {
        notFound("Task not found");
      }

      const content = input.message.content.trim();
      if (content.length === 0) {
        badRequest("content is required");
      }

      if (!["user", "assistant"].includes(input.message.role)) {
        badRequest("role must be 'user' or 'assistant'");
      }

      const result = await withTransaction(db, async (tx, txid) => {
        const requestedCreatedAt = parseOptionalTimestamp(input.message.createdAt) ?? Date.now();
        const latestCreatedAt = await getLatestTaskMessageTimestamp(
          tx as unknown as AppDb,
          input.taskId,
        );
        const createdAt =
          latestCreatedAt !== null && latestCreatedAt >= requestedCreatedAt
            ? latestCreatedAt + 1
            : requestedCreatedAt;

        const message = {
          id: parseOptionalId(input.message.id) ?? crypto.randomUUID(),
          organizationId: orgId,
          taskId: input.taskId,
          role: input.message.role,
          content,
          createdAt,
        };

        await tx.insert(schema.taskMessages).values(message);
        await tx
          .update(schema.tasks)
          .set({ updatedAt: createdAt })
          .where(eq(schema.tasks.id, input.taskId));

        return { data: message, txid };
      });

      return result;
    }),
    createRun: os.tasks.createRun.handler(async ({ input, context }) => {
      const db = context.db;
      const orgId = getOrgId(context);
      const userId = context.session.user.id;
      const taskId = input.taskId;

      try {
        if (!orgId) {
          badRequest("No active organization");
        }

        const task = await getTaskForOrg(db, taskId, orgId);
        if (!task) {
          notFound("Task not found");
        }

        const requestedProvider = input.provider?.trim().toLowerCase() ?? "";
        const providerInput =
          requestedProvider.length > 0 ? requestedProvider : DEFAULT_OPENCODE_PROVIDER;
        if (!isSupportedOpencodeProvider(providerInput)) {
          badRequest(`Unsupported provider: ${providerInput}`);
        }

        const model = input.model?.trim() ?? DEFAULT_OPENCODE_MODEL;
        if (model.length === 0) {
          badRequest("model is required");
        }

        const hasCredential = await db.query.userProviderCredentials.findFirst({
          where: and(
            eq(schema.userProviderCredentials.userId, userId),
            eq(schema.userProviderCredentials.provider, providerInput),
          ),
          columns: { id: true },
        });
        if (!hasCredential) {
          badRequest(`No ${providerInput} credentials configured in Settings`);
        }

        const inputMessage = input.messageId
          ? await db.query.taskMessages.findFirst({
              where: and(
                eq(schema.taskMessages.id, input.messageId),
                eq(schema.taskMessages.taskId, taskId),
                eq(schema.taskMessages.role, "user"),
              ),
            })
          : await db.query.taskMessages.findFirst({
              where: and(
                eq(schema.taskMessages.taskId, taskId),
                eq(schema.taskMessages.role, "user"),
              ),
              orderBy: desc(schema.taskMessages.createdAt),
            });

        if (!inputMessage) {
          badRequest("No user message found for this task");
        }

        const now = Date.now();
        const run = {
          id: crypto.randomUUID(),
          taskId,
          tool: "opencode",
          status: "queued",
          inputMessageId: inputMessage.id,
          outputMessageId: null,
          sandboxId: null,
          sessionId: null,
          initiatedByUserId: userId,
          provider: providerInput,
          model,
          error: null,
          startedAt: null,
          finishedAt: null,
          createdAt: now,
          updatedAt: now,
        };

        await db.insert(schema.taskRuns).values(run);
        await db
          .update(schema.tasks)
          .set({ status: "running", updatedAt: now })
          .where(eq(schema.tasks.id, taskId));

        const project = task.projectId
          ? await db.query.projects.findFirst({
              where: and(
                eq(schema.projects.id, task.projectId),
                eq(schema.projects.organizationId, orgId),
              ),
              columns: { repoUrl: true, installationId: true, setupCommand: true },
            })
          : null;

        if (!project?.repoUrl) {
          badRequest("Task's project has no repository URL configured");
        }

        context.executionCtx.waitUntil(
          executeTaskRun({
            db: getDb(context.env),
            env: context.env,
            runId: run.id,
            taskId,
            taskTitle: task.title,
            prompt: inputMessage.content,
            repoUrl: project.repoUrl,
            installationId: project.installationId ?? null,
            setupCommand: project.setupCommand ?? null,
            initiatedByUserId: userId,
            organizationId: orgId,
            provider: providerInput,
            model,
          }),
        );

        return run;
      } catch (error) {
        if (error instanceof ORPCError) {
          throw error;
        }

        const message = getErrorMessage(error, "Failed to create task run");
        console.error("Failed to create task run", { taskId, userId, message });
        internalError(message);
      }
    }),
  },
  settings: {
    getProviderCredentialStatus: os.settings.getProviderCredentialStatus.handler(
      async ({ input, context }) => {
        const provider = parseProvider(input.provider);
        if (!provider) {
          badRequest("Unsupported provider");
        }

        return getProviderCredentialStatus(context.db, context.session.user.id, provider);
      },
    ),
    upsertProviderCredential: os.settings.upsertProviderCredential.handler(
      async ({ input, context }) => {
        const provider = parseProvider(input.provider);
        if (!provider) {
          badRequest("Unsupported provider");
        }

        const apiKey = input.apiKey.trim();
        if (apiKey.length === 0) {
          badRequest("apiKey is required");
        }

        return upsertProviderApiKeyCredential(
          context.db,
          context.env,
          context.session.user.id,
          provider,
          apiKey,
        );
      },
    ),
    deleteProviderCredential: os.settings.deleteProviderCredential.handler(
      async ({ input, context }) => {
        const provider = parseProvider(input.provider);
        if (!provider) {
          badRequest("Unsupported provider");
        }

        const db = context.db;
        const userId = context.session.user.id;

        await deleteProviderCredential(db, userId, provider);
        await db
          .delete(schema.userProviderOauthAttempts)
          .where(
            and(
              eq(schema.userProviderOauthAttempts.userId, userId),
              eq(schema.userProviderOauthAttempts.provider, provider),
            ),
          );

        return { provider, configured: false, authType: null, updatedAt: null };
      },
    ),
    startProviderOauth: os.settings.startProviderOauth.handler(async ({ input, context }) => {
      const provider = parseProvider(input.provider);
      if (!provider) {
        badRequest("Unsupported provider");
      }

      const requestId = crypto.randomUUID();
      const userId = context.session.user.id;
      console.info("Provider OAuth start requested", { requestId, userId, provider });

      const sandboxId = buildProviderAuthSandboxId({ userId, provider });
      const sandbox = getTaskSandbox(context.env, sandboxId);
      const { client } = await getOpenCodeClient(sandbox, OAUTH_WORKDIR);

      const methodsResponse = await client.provider.auth();
      const methods = methodsResponse.data?.[provider] ?? [];
      const oauthMethod = pickOAuthMethod(methods);
      if (oauthMethod === null) {
        badRequest(`No OAuth method available for ${provider}`);
      }

      const authorizeResponse = await client.provider.oauth.authorize({
        path: { id: provider },
        body: { method: oauthMethod },
      });

      const authorization = authorizeResponse.data;
      if (!authorization?.url) {
        internalError("Failed to start provider OAuth flow");
      }

      const now = Date.now();
      const attemptId = crypto.randomUUID();
      const expiresAt = now + PROVIDER_OAUTH_ATTEMPT_TTL_MS;

      const db = context.db;
      await db
        .delete(schema.userProviderOauthAttempts)
        .where(
          and(
            eq(schema.userProviderOauthAttempts.userId, userId),
            eq(schema.userProviderOauthAttempts.provider, provider),
          ),
        );

      await db.insert(schema.userProviderOauthAttempts).values({
        id: attemptId,
        userId,
        provider,
        sandboxId,
        method: oauthMethod,
        createdAt: now,
        expiresAt,
      });

      return {
        attemptId,
        url: authorization.url,
        instructions: authorization.instructions,
        method: authorization.method,
        expiresAt,
      };
    }),
    completeProviderOauth: os.settings.completeProviderOauth.handler(async ({ input, context }) => {
      const provider = parseProvider(input.provider);
      if (!provider) {
        badRequest("Unsupported provider");
      }

      const userId = context.session.user.id;
      const attemptId = input.attemptId.trim();
      if (attemptId.length === 0) {
        badRequest("attemptId is required");
      }
      const code = input.code?.trim() ?? "";
      const requestId = crypto.randomUUID();
      const db = context.db;

      await db
        .delete(schema.userProviderOauthAttempts)
        .where(lt(schema.userProviderOauthAttempts.expiresAt, Date.now()));

      const attempt = await db.query.userProviderOauthAttempts.findFirst({
        where: and(
          eq(schema.userProviderOauthAttempts.id, attemptId),
          eq(schema.userProviderOauthAttempts.userId, userId),
          eq(schema.userProviderOauthAttempts.provider, provider),
        ),
      });
      if (!attempt) {
        badRequest("OAuth attempt not found or expired");
      }

      const sandbox = getTaskSandbox(context.env, attempt.sandboxId);
      const { client } = await getOpenCodeClient(sandbox, OAUTH_WORKDIR);

      let callbackResponse: Awaited<ReturnType<typeof client.provider.oauth.callback>>;
      try {
        callbackResponse = await client.provider.oauth.callback({
          path: { id: provider },
          body: code.length > 0 ? { method: attempt.method, code } : { method: attempt.method },
        });
      } catch (error) {
        badRequest(toProviderOauthCallbackError(error));
      }

      const callbackError = extractErrorMessage((callbackResponse as { error?: unknown }).error);
      if (!callbackResponse.data) {
        if (callbackError) {
          badRequest(toProviderOauthCallbackError(callbackError));
        }

        badRequest("Provider OAuth callback did not complete");
      }

      const providerAuth = await readProviderAuthFromSandbox(sandbox, provider);
      if (!providerAuth) {
        const inspection = await inspectProviderAuthFromSandbox(sandbox, provider);
        console.error("Provider OAuth callback succeeded but auth token not found", {
          requestId,
          userId,
          provider,
          attemptId: attempt.id,
          inspection,
        });
        internalError(
          "Provider OAuth completed but no auth token was found in the OpenCode sandbox. Start OAuth again and retry completion.",
        );
      }

      let status;
      try {
        status = await upsertProviderAuthCredential(
          db,
          context.env,
          userId,
          provider,
          providerAuth,
        );
      } catch (error) {
        internalError(toCredentialPersistError(error));
      }

      await db
        .delete(schema.userProviderOauthAttempts)
        .where(eq(schema.userProviderOauthAttempts.id, attempt.id));

      return status;
    }),
  },
});

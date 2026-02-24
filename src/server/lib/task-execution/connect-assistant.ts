import { eq } from "drizzle-orm";
import type { AppDb } from "../../db/client";
import * as schema from "../../db/schema";
import type { SupportedOpencodeProvider } from "../opencode";
import { toProviderModelRef } from "../opencode";
import { getDecryptedProviderAuth } from "../provider-credentials";
import { getOpenCodeClient, type TaskSandbox } from "../sandbox";
import type { SecretCryptoEnv } from "../secret-crypto";

export async function connectAssistant(args: {
  sandbox: TaskSandbox;
  repoDir: string;
  provider: SupportedOpencodeProvider;
  model: string;
  db: AppDb;
  env: SecretCryptoEnv;
  userId: string;
}) {
  const { sandbox, repoDir, provider, model, db, env, userId } = args;

  const providerAuth = await getDecryptedProviderAuth(db, env, userId, provider);
  if (!providerAuth) {
    throw new Error(`No ${provider} credentials configured. Add them in Settings first.`);
  }

  const { client } = await getOpenCodeClient(sandbox, repoDir, {
    enabled_providers: [provider],
    model: toProviderModelRef(provider, model),
  });

  await client.auth.set({
    path: { id: provider },
    body: providerAuth,
  });

  return { client };
}

export async function ensureSession(args: {
  client: Awaited<ReturnType<typeof getOpenCodeClient>>["client"];
  db: AppDb;
  taskId: string;
  taskTitle: string;
  sandboxId: string;
}): Promise<{ sessionId: string; isNewSession: boolean }> {
  const { client, db, taskId, taskTitle, sandboxId } = args;

  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, taskId),
    columns: { sessionId: true },
  });

  let sessionId = task?.sessionId ?? null;
  let isNewSession = false;
  if (sessionId) {
    try {
      const existing = await client.session.get({ path: { id: sessionId } });
      if (!existing.data) {
        sessionId = null;
      }
    } catch {
      sessionId = null;
    }
  }

  if (!sessionId) {
    const { data: session } = await client.session.create({
      body: { title: taskTitle },
    });
    sessionId = session?.id ?? null;
    if (!sessionId) {
      throw new Error("Failed to create OpenCode session");
    }
    isNewSession = true;
  }

  await db
    .update(schema.tasks)
    .set({ sessionId, sandboxId, updatedAt: Date.now() })
    .where(eq(schema.tasks.id, taskId));

  return { sessionId, isNewSession };
}

import { and, desc, eq, isNotNull, lte } from "drizzle-orm";
import type { ModelMessage, RunRecord, RunStatus, TokenUsage } from "@tanstack/ai";
import { isRunStatus } from "@tanstack/ai";
import {
  defineAIPersistence,
  defineInterruptStore,
  defineMessageStore,
  defineMetadataStore,
  defineRunStore,
  type InterruptRecord,
  type InterruptStatus,
} from "@tanstack/ai-persistence";
import { getDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";

export const taskChatPersistence = defineAIPersistence({
  stores: {
    messages: defineMessageStore({
      async loadThread(threadId) {
        const db = await getDb();
        const row = await db.query.aiMessages.findFirst({
          where: eq(schema.aiMessages.threadId, threadId),
        });
        if (!row) {
          return [];
        }

        return JSON.parse(row.messagesJson) as ModelMessage[];
      },
      async saveThread(threadId, messages) {
        const db = await getDb();
        const messagesJson = JSON.stringify(messages);
        await db.insert(schema.aiMessages).values({ threadId, messagesJson }).onConflictDoUpdate({
          target: schema.aiMessages.threadId,
          set: { messagesJson },
        });
      },
    }),
    runs: defineRunStore({
      async createOrResume(input) {
        const db = await getDb();
        await db
          .insert(schema.aiRuns)
          .values({
            runId: input.runId,
            threadId: input.threadId,
            status: input.status ?? "running",
            startedAt: input.startedAt,
          })
          .onConflictDoNothing();

        const existing = await db.query.aiRuns.findFirst({
          where: eq(schema.aiRuns.runId, input.runId),
        });
        if (!existing) {
          return {
            runId: input.runId,
            threadId: input.threadId,
            status: input.status ?? "running",
            startedAt: input.startedAt,
          };
        }

        return toRunRecord(existing);
      },
      async update(runId, patch) {
        const db = await getDb();
        const existing = await db.query.aiRuns.findFirst({
          where: eq(schema.aiRuns.runId, runId),
        });
        if (!existing) {
          return;
        }

        await db
          .update(schema.aiRuns)
          .set(toRunPatchColumns(patch))
          .where(eq(schema.aiRuns.runId, runId));
      },
      async get(runId) {
        const db = await getDb();
        const row = await db.query.aiRuns.findFirst({
          where: eq(schema.aiRuns.runId, runId),
        });
        return row ? toRunRecord(row) : null;
      },
      async findActiveRun(threadId) {
        const db = await getDb();
        const row = await db.query.aiRuns.findFirst({
          where: and(eq(schema.aiRuns.threadId, threadId), eq(schema.aiRuns.status, "running")),
          orderBy: [desc(schema.aiRuns.startedAt)],
        });
        return row ? toRunRecord(row) : null;
      },
      async listByThread(threadId) {
        const db = await getDb();
        const rows = await db.query.aiRuns.findMany({
          where: eq(schema.aiRuns.threadId, threadId),
          orderBy: (runs, { asc }) => [asc(runs.startedAt)],
        });
        return rows.map(toRunRecord);
      },
      async listReclaimable(opts) {
        const db = await getDb();
        const cutoff = opts.now - opts.ttlMs;
        const rows = await db.query.aiRuns.findMany({
          where: and(
            eq(schema.aiRuns.status, "running"),
            isNotNull(schema.aiRuns.detachedSince),
            lte(schema.aiRuns.detachedSince, cutoff),
          ),
        });
        return rows.map(toRunRecord);
      },
    }),
    interrupts: defineInterruptStore({
      async create(record) {
        const db = await getDb();
        await db
          .insert(schema.aiInterrupts)
          .values({
            interruptId: record.interruptId,
            runId: record.runId,
            threadId: record.threadId,
            status: "pending",
            requestedAt: record.requestedAt,
            payloadJson: JSON.stringify(record.payload),
          })
          .onConflictDoNothing();
      },
      async resolve(interruptId, response) {
        const db = await getDb();
        await db
          .update(schema.aiInterrupts)
          .set({
            status: "resolved",
            resolvedAt: Date.now(),
            responseJson: JSON.stringify(response),
          })
          .where(eq(schema.aiInterrupts.interruptId, interruptId));
      },
      async cancel(interruptId) {
        const db = await getDb();
        await db
          .update(schema.aiInterrupts)
          .set({
            status: "cancelled",
            resolvedAt: Date.now(),
          })
          .where(eq(schema.aiInterrupts.interruptId, interruptId));
      },
      async get(interruptId) {
        const db = await getDb();
        const row = await db.query.aiInterrupts.findFirst({
          where: eq(schema.aiInterrupts.interruptId, interruptId),
        });
        return row ? toInterruptRecord(row) : null;
      },
      async list(threadId) {
        const db = await getDb();
        const rows = await db.query.aiInterrupts.findMany({
          where: eq(schema.aiInterrupts.threadId, threadId),
          orderBy: (interrupts, { asc }) => [asc(interrupts.requestedAt)],
        });
        return rows.map(toInterruptRecord);
      },
      async listPending(threadId) {
        const db = await getDb();
        const rows = await db.query.aiInterrupts.findMany({
          where: and(
            eq(schema.aiInterrupts.threadId, threadId),
            eq(schema.aiInterrupts.status, "pending"),
          ),
          orderBy: (interrupts, { asc }) => [asc(interrupts.requestedAt)],
        });
        return rows.map(toInterruptRecord);
      },
      async listByRun(runId) {
        const db = await getDb();
        const rows = await db.query.aiInterrupts.findMany({
          where: eq(schema.aiInterrupts.runId, runId),
          orderBy: (interrupts, { asc }) => [asc(interrupts.requestedAt)],
        });
        return rows.map(toInterruptRecord);
      },
      async listPendingByRun(runId) {
        const db = await getDb();
        const rows = await db.query.aiInterrupts.findMany({
          where: and(
            eq(schema.aiInterrupts.runId, runId),
            eq(schema.aiInterrupts.status, "pending"),
          ),
          orderBy: (interrupts, { asc }) => [asc(interrupts.requestedAt)],
        });
        return rows.map(toInterruptRecord);
      },
    }),
    metadata: defineMetadataStore({
      async get(namespace, key) {
        const db = await getDb();
        const row = await db.query.aiMetadata.findFirst({
          where: and(eq(schema.aiMetadata.scope, namespace), eq(schema.aiMetadata.key, key)),
        });
        return row ? (JSON.parse(row.valueJson) as unknown) : null;
      },
      async set(namespace, key, value) {
        const db = await getDb();
        const valueJson = JSON.stringify(value);
        await db
          .insert(schema.aiMetadata)
          .values({ scope: namespace, key, valueJson })
          .onConflictDoUpdate({
            target: [schema.aiMetadata.scope, schema.aiMetadata.key],
            set: { valueJson },
          });
      },
      async delete(namespace, key) {
        const db = await getDb();
        await db
          .delete(schema.aiMetadata)
          .where(and(eq(schema.aiMetadata.scope, namespace), eq(schema.aiMetadata.key, key)));
      },
    }),
  },
});

function toRunRecord(row: typeof schema.aiRuns.$inferSelect): RunRecord {
  const record: RunRecord = {
    runId: row.runId,
    threadId: row.threadId,
    status: toRunStatus(row.status),
    startedAt: row.startedAt,
  };

  if (row.finishedAt !== null) {
    record.finishedAt = row.finishedAt;
  }
  if (row.error !== null) {
    record.error = {
      message: row.error,
      ...(row.errorCode !== null ? { code: row.errorCode } : {}),
    };
  }
  if (row.usageJson !== null) {
    record.usage = JSON.parse(row.usageJson) as TokenUsage;
  }
  if (row.sandboxKey !== null) {
    record.sandboxKey = row.sandboxKey;
  }
  if (row.detachedSince !== null) {
    record.detachedSince = row.detachedSince;
  }
  if (row.cancelRequested !== null) {
    record.cancelRequested = row.cancelRequested === 1;
  }
  if (row.driverEpoch !== null) {
    record.driverEpoch = row.driverEpoch;
  }

  return record;
}

function toRunStatus(value: string): RunStatus {
  if (isRunStatus(value)) {
    return value;
  }

  return "running";
}

function toRunPatchColumns(
  patch: Partial<
    Pick<
      RunRecord,
      | "status"
      | "finishedAt"
      | "error"
      | "usage"
      | "sandboxKey"
      | "detachedSince"
      | "cancelRequested"
      | "driverEpoch"
    >
  >,
): Partial<typeof schema.aiRuns.$inferInsert> {
  const columns: Partial<typeof schema.aiRuns.$inferInsert> = {};

  if ("status" in patch && patch.status !== undefined) {
    columns.status = patch.status;
  }
  if ("finishedAt" in patch) {
    columns.finishedAt = patch.finishedAt ?? null;
  }
  if ("error" in patch) {
    columns.error = patch.error?.message ?? null;
    columns.errorCode = patch.error?.code ?? null;
  }
  if ("usage" in patch) {
    columns.usageJson = patch.usage === undefined ? null : JSON.stringify(patch.usage);
  }
  if ("sandboxKey" in patch) {
    columns.sandboxKey = patch.sandboxKey ?? null;
  }
  if ("detachedSince" in patch) {
    columns.detachedSince = patch.detachedSince ?? null;
  }
  if ("cancelRequested" in patch) {
    columns.cancelRequested =
      patch.cancelRequested === undefined ? null : patch.cancelRequested ? 1 : 0;
  }
  if ("driverEpoch" in patch) {
    columns.driverEpoch = patch.driverEpoch ?? null;
  }

  return columns;
}

function toInterruptRecord(row: typeof schema.aiInterrupts.$inferSelect): InterruptRecord {
  const record: InterruptRecord = {
    interruptId: row.interruptId,
    runId: row.runId,
    threadId: row.threadId,
    status: row.status as InterruptStatus,
    requestedAt: row.requestedAt,
    payload: JSON.parse(row.payloadJson) as Record<string, unknown>,
  };

  if (row.resolvedAt !== null) {
    record.resolvedAt = row.resolvedAt;
  }
  if (row.responseJson !== null) {
    record.response = JSON.parse(row.responseJson) as unknown;
  }

  return record;
}

export async function loadTaskThreadMessages(threadId: string): Promise<ModelMessage[]> {
  return await taskChatPersistence.stores.messages.loadThread(threadId);
}

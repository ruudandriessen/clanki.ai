import type { StreamChunk, StreamDurability } from "@tanstack/ai";
import { resolveResumeRunId } from "@tanstack/ai";
import { and, eq, gt } from "drizzle-orm";
import type { AppDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";

const SQLITE_OFFSET_PREFIX = "sqlite:v1:";
const FIRST_CHUNK_POLL_MS = 250;

type SqliteStreamInit = {
  runId: string;
  offset?: string | null;
};

type StreamWaiter = {
  wake: () => void;
  timer?: ReturnType<typeof setTimeout>;
};

const streamWaiters = new Map<string, StreamWaiter[]>();

function readResumeOffset(request: Request): string | null {
  const header = request.headers.get("Last-Event-ID");
  if (header) {
    return header;
  }

  return new URL(request.url).searchParams.get("offset");
}

function assertValidRunId(runId: string): string {
  if (runId.length === 0 || /[\r\n]/.test(runId)) {
    throw new Error(
      `Invalid runId (must be non-empty and contain no CR/LF): ${JSON.stringify(runId)}`,
    );
  }

  return runId;
}

function resolveSqliteRunId(request: Request, resumeOffset: string | null): string {
  if (resumeOffset !== null && resumeOffset !== "-1" && resumeOffset !== "now") {
    return assertValidRunId(decodeSqliteOffset(resumeOffset).runId);
  }

  const requestedRunId = resolveResumeRunId(request);
  return requestedRunId === null ? crypto.randomUUID() : assertValidRunId(requestedRunId);
}

function encodeSqliteOffset(runId: string, seq: number): string {
  return `${SQLITE_OFFSET_PREFIX}${encodeURIComponent(runId)}:${seq}`;
}

function decodeSqliteOffset(offset: string): { runId: string; seq: number } {
  if (!offset.startsWith(SQLITE_OFFSET_PREFIX)) {
    throw new Error(`Invalid sqlite stream offset: ${offset}`);
  }

  const encoded = offset.slice(SQLITE_OFFSET_PREFIX.length);
  const separator = encoded.lastIndexOf(":");
  if (separator === -1) {
    throw new Error(`Invalid sqlite stream offset: ${offset}`);
  }

  const runId = decodeURIComponent(encoded.slice(0, separator));
  const seq = Number(encoded.slice(separator + 1));
  if (!Number.isSafeInteger(seq) || seq < 1) {
    throw new Error(`Invalid sqlite stream offset: ${offset}`);
  }

  return { runId, seq };
}

function streamThreshold(offset: string, runId: string, tailSeq: number): number {
  if (offset === "-1") {
    return -1;
  }

  if (offset === "now") {
    return tailSeq;
  }

  const decoded = decodeSqliteOffset(offset);
  if (decoded.runId !== runId) {
    throw new Error(
      `Sqlite stream offset belongs to run ${JSON.stringify(decoded.runId)}, not ${JSON.stringify(runId)}`,
    );
  }

  return decoded.seq;
}

function wakeStreamWaiters(runId: string): void {
  const waiters = streamWaiters.get(runId);
  if (!waiters) {
    return;
  }

  streamWaiters.delete(runId);
  for (const waiter of waiters) {
    if (waiter.timer !== undefined) {
      clearTimeout(waiter.timer);
    }
    waiter.wake();
  }
}

async function ensureStreamLog(db: AppDb, runId: string): Promise<void> {
  await db.insert(schema.aiStreamLogs).values({ runId, complete: 0 }).onConflictDoNothing();
}

async function loadStreamTail(db: AppDb, runId: string): Promise<number> {
  const rows = await db.query.aiStreamChunks.findMany({
    where: eq(schema.aiStreamChunks.runId, runId),
    columns: { seq: true },
    orderBy: (chunks, { desc }) => [desc(chunks.seq)],
    limit: 1,
  });

  return rows[0]?.seq ?? 0;
}

async function loadStreamState(db: AppDb, runId: string) {
  const [log, chunks] = await Promise.all([
    db.query.aiStreamLogs.findFirst({
      where: eq(schema.aiStreamLogs.runId, runId),
    }),
    db.query.aiStreamChunks.findMany({
      where: eq(schema.aiStreamChunks.runId, runId),
      orderBy: (entries, { asc }) => [asc(entries.seq)],
    }),
  ]);

  return {
    log,
    entries: chunks.map((entry) => ({
      seq: entry.seq,
      offset: encodeSqliteOffset(runId, entry.seq),
      chunk: JSON.parse(entry.chunkJson) as StreamChunk,
    })),
  };
}

async function waitForStreamUpdate(runId: string, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    const waiter: StreamWaiter = {
      wake: () => {
        cleanup();
        resolve();
      },
    };

    const cleanup = () => {
      if (waiter.timer !== undefined) {
        clearTimeout(waiter.timer);
      }
      signal?.removeEventListener("abort", onAbort);
      const waiters = streamWaiters.get(runId);
      if (waiters) {
        const index = waiters.indexOf(waiter);
        if (index !== -1) {
          waiters.splice(index, 1);
        }
        if (waiters.length === 0) {
          streamWaiters.delete(runId);
        }
      }
    };

    const onAbort = () => {
      cleanup();
      resolve();
    };

    const waiters = streamWaiters.get(runId) ?? [];
    waiters.push(waiter);
    streamWaiters.set(runId, waiters);
    waiter.timer = setTimeout(() => {
      cleanup();
      resolve();
    }, FIRST_CHUNK_POLL_MS);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function sqliteStream(
  source: Request | SqliteStreamInit,
  getDbClient: () => Promise<AppDb>,
): StreamDurability {
  const resumeOffset =
    source instanceof Request ? readResumeOffset(source) : (source.offset ?? null);
  const runId =
    source instanceof Request
      ? resolveSqliteRunId(source, resumeOffset)
      : assertValidRunId(source.runId);

  return {
    resumeFrom: () => resumeOffset,

    append: async (chunks) => {
      const db = await getDbClient();
      await ensureStreamLog(db, runId);
      const tailSeq = await loadStreamTail(db, runId);
      const offsets: string[] = [];

      for (let index = 0; index < chunks.length; index += 1) {
        const seq = tailSeq + index + 1;
        const offset = encodeSqliteOffset(runId, seq);
        await db.insert(schema.aiStreamChunks).values({
          runId,
          seq,
          chunkJson: JSON.stringify(chunks[index]),
        });
        offsets.push(offset);
      }

      wakeStreamWaiters(runId);
      return offsets;
    },

    snapshot: async () => {
      const db = await getDbClient();
      const { entries } = await loadStreamState(db, runId);
      return entries.map((entry) => ({
        offset: entry.offset,
        chunk: entry.chunk,
      }));
    },

    close: async () => {
      const db = await getDbClient();
      await ensureStreamLog(db, runId);
      await db
        .update(schema.aiStreamLogs)
        .set({ complete: 1, completedAt: Date.now() })
        .where(eq(schema.aiStreamLogs.runId, runId));
      wakeStreamWaiters(runId);
    },

    read: async function* (offset, signal) {
      const db = await getDbClient();
      const isFromStartJoin = offset === "-1" || offset === "now";
      let log = await db.query.aiStreamLogs.findFirst({
        where: eq(schema.aiStreamLogs.runId, runId),
      });

      if (log === undefined) {
        if (!isFromStartJoin) {
          throw new Error(`Unknown or expired sqlite stream run: ${JSON.stringify(runId)}`);
        }

        await ensureStreamLog(db, runId);
        log = await db.query.aiStreamLogs.findFirst({
          where: eq(schema.aiStreamLogs.runId, runId),
        });
      }

      const tailSeq = await loadStreamTail(db, runId);
      let lastYieldedSeq = streamThreshold(offset, runId, tailSeq);

      for (;;) {
        const chunkRows = await db.query.aiStreamChunks.findMany({
          where: and(
            eq(schema.aiStreamChunks.runId, runId),
            gt(schema.aiStreamChunks.seq, lastYieldedSeq),
          ),
          orderBy: (entries, { asc }) => [asc(entries.seq)],
        });

        for (const chunkRow of chunkRows) {
          lastYieldedSeq = chunkRow.seq;
          yield {
            offset: encodeSqliteOffset(runId, chunkRow.seq),
            chunk: JSON.parse(chunkRow.chunkJson) as StreamChunk,
          };
        }

        const currentLog = await db.query.aiStreamLogs.findFirst({
          where: eq(schema.aiStreamLogs.runId, runId),
        });
        if (currentLog?.complete === 1 || signal?.aborted) {
          return;
        }

        await waitForStreamUpdate(runId, signal);
        if (signal?.aborted) {
          return;
        }
      }
    },
  };
}

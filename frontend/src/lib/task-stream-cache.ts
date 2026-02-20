import type { TaskStreamEvent } from "../../../shared/task-stream-events";

const DB_NAME = "task-event-stream-cache";
const DB_VERSION = 1;
const STORE_NAME = "streams";

type TaskStreamCacheRecord = {
  key: string;
  offset?: string | null;
  cursor?: string | null;
  events: TaskStreamEvent[];
  updatedAt: number;
};

type TaskStreamCacheSnapshot = {
  offset: string | null;
  events: TaskStreamEvent[];
};

function canUseIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.addEventListener("error", () => {
      reject(request.error ?? new Error("Failed to open IndexedDB"));
    });
  });
}

function isTaskStreamEvent(value: unknown): value is TaskStreamEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.taskId === "string" &&
    typeof candidate.runId === "string" &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.kind === "string" &&
    typeof candidate.payload === "string"
  );
}

function parseTaskStreamEvents(value: unknown): TaskStreamEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isTaskStreamEvent);
}

export async function readTaskStreamCache(key: string): Promise<TaskStreamCacheSnapshot> {
  if (!canUseIndexedDb()) {
    return { offset: null, events: [] };
  }

  try {
    const db = await openDatabase();
    const snapshot = await new Promise<TaskStreamCacheSnapshot>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const record = request.result as TaskStreamCacheRecord | undefined;
        if (!record) {
          resolve({ offset: null, events: [] });
          return;
        }

        resolve({
          offset:
            typeof record.offset === "string" && record.offset.length > 0
              ? record.offset
              : typeof record.cursor === "string" && record.cursor.length > 0
                ? record.cursor
                : null,
          events: parseTaskStreamEvents(record.events),
        });
      };

      request.addEventListener("error", () => {
        reject(request.error ?? new Error("Failed to read stream cache"));
      });
    });

    db.close();
    return snapshot;
  } catch {
    return { offset: null, events: [] };
  }
}

export async function writeTaskStreamCache(
  key: string,
  offset: string | null,
  events: TaskStreamEvent[],
): Promise<void> {
  if (!canUseIndexedDb()) {
    return;
  }

  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put({ key, offset, events, updatedAt: Date.now() } satisfies TaskStreamCacheRecord);

      tx.oncomplete = () => {
        resolve();
      };

      tx.addEventListener("error", () => {
        reject(tx.error ?? new Error("Failed to persist stream cache"));
      });

      tx.addEventListener("abort", () => {
        reject(tx.error ?? new Error("Failed to persist stream cache"));
      });
    });
    db.close();
  } catch {
    return;
  }
}

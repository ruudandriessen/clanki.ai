import { asc, eq } from "drizzle-orm";
import type { AppDb } from "../db/client";
import * as schema from "../db/schema";
import type { TaskStreamEvent } from "@/shared/task-stream-events";

type TaskEventListener = (event: TaskStreamEvent) => void;

const listeners = new Map<string, Set<TaskEventListener>>();

export async function appendTaskEvent(db: AppDb, event: TaskStreamEvent): Promise<void> {
  await db.insert(schema.taskEvents).values({
    id: event.id,
    taskId: event.taskId,
    payload: JSON.stringify(event),
    createdAt: event.createdAt,
  });

  for (const listener of listeners.get(event.taskId) ?? []) {
    listener(event);
  }
}

export async function listTaskEvents(db: AppDb, taskId: string): Promise<TaskStreamEvent[]> {
  const rows = await db.query.taskEvents.findMany({
    where: eq(schema.taskEvents.taskId, taskId),
    orderBy: asc(schema.taskEvents.createdAt),
  });

  return rows
    .map((row) => parseStoredTaskEvent(row.payload))
    .filter((event): event is TaskStreamEvent => event !== null);
}

export function subscribeTaskEvents(taskId: string, listener: TaskEventListener): () => void {
  const existing = listeners.get(taskId) ?? new Set<TaskEventListener>();
  existing.add(listener);
  listeners.set(taskId, existing);

  return () => {
    const current = listeners.get(taskId);
    if (!current) {
      return;
    }

    current.delete(listener);
    if (current.size === 0) {
      listeners.delete(taskId);
    }
  };
}

function parseStoredTaskEvent(payload: string): TaskStreamEvent | null {
  try {
    const parsed = JSON.parse(payload) as TaskStreamEvent;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.taskId !== "string" ||
      typeof parsed.runId !== "string" ||
      typeof parsed.createdAt !== "number" ||
      typeof parsed.kind !== "string" ||
      typeof parsed.payload !== "string"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

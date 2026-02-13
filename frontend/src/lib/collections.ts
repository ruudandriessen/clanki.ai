import { snakeCamelMapper } from "@electric-sql/client";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { createCollection } from "@tanstack/react-db";
import type { Project, Task, TaskMessage } from "./api";

const ELECTRIC_BASE_URL = "/api/electric";

const electricParser = {
  // Parse bigint columns (Postgres int8) into JS numbers.
  int8: (value: string) => Number(value),
};

const columnMapper = snakeCamelMapper();

export const projectsCollection = createCollection(
  electricCollectionOptions<Project>({
    id: "projects",
    shapeOptions: {
      url: `${ELECTRIC_BASE_URL}/projects`,
      parser: electricParser,
      columnMapper,
    },
    syncMode: "progressive",
    getKey: (p) => p.id,
  }),
);

export const tasksCollection = createCollection(
  electricCollectionOptions<Task>({
    id: "tasks",
    shapeOptions: {
      url: `${ELECTRIC_BASE_URL}/tasks`,
      parser: electricParser,
      columnMapper,
    },
    syncMode: "progressive",
    getKey: (t) => t.id,
  }),
);

const taskMessageCollections = new Map<string, ReturnType<typeof createTaskMessagesCollection>>();

function createTaskMessagesCollection(taskId: string) {
  return createCollection(
    electricCollectionOptions<TaskMessage>({
      id: `taskMessages:${taskId}`,
      shapeOptions: {
        url: `${ELECTRIC_BASE_URL}/tasks/${taskId}/messages`,
        parser: electricParser,
        columnMapper,
      },
      syncMode: "progressive",
      getKey: (m) => m.id,
    }),
  );
}

export function getTaskMessagesCollection(taskId: string) {
  let col = taskMessageCollections.get(taskId);
  if (!col) {
    col = createTaskMessagesCollection(taskId);
    taskMessageCollections.set(taskId, col);
  }
  return col;
}

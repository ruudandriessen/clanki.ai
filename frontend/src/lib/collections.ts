import { createCollection } from "@tanstack/react-db";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { QueryClient } from "@tanstack/query-core";
import {
  fetchProjects,
  fetchTasks,
  fetchTaskMessages,
  type Project,
  type Task,
  type TaskMessage,
} from "./api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
    },
  },
});

// ---- Projects collection ----

export const projectsCollection = createCollection(
  queryCollectionOptions({
    queryKey: ["projects"] as const,
    queryFn: async (): Promise<Array<Project>> => fetchProjects(),
    queryClient,
    getKey: (p) => p.id,
  }),
);

// ---- Tasks collection ----

export const tasksCollection = createCollection(
  queryCollectionOptions({
    queryKey: ["tasks"] as const,
    queryFn: async (): Promise<Array<Task>> => fetchTasks(),
    queryClient,
    getKey: (t) => t.id,
  }),
);

// ---- Task messages collection (per task) ----

const taskMessageCollections = new Map<string, ReturnType<typeof createTaskMessagesCollection>>();

function createTaskMessagesCollection(taskId: string) {
  return createCollection(
    queryCollectionOptions({
      queryKey: ["taskMessages", taskId] as const,
      queryFn: async (): Promise<Array<TaskMessage>> => fetchTaskMessages(taskId),
      queryClient,
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

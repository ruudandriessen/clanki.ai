import { createCollection } from "@tanstack/react-db";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { z } from "zod";
import { createProjects } from "@/server/functions/projects";
import { createTask, createTaskMessage, deleteTask, updateTask } from "@/server/functions/tasks";

const projectSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  name: z.string(),
  repo_url: z.string().nullable(),
  installation_id: z.number().nullable(),
  setup_command: z.string().nullable(),
  run_command: z.string().nullable(),
  run_port: z.number().nullable(),
  created_at: z.bigint(),
  updated_at: z.bigint(),
});
export type Project = z.infer<typeof projectSchema>;

const taskSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  project_id: z.string().nullable(),
  title: z.string(),
  status: z.string(),
  runner_type: z.string().nullable(),
  runner_session_id: z.string().nullable(),
  stream_id: z.string().nullable(),
  workspace_path: z.string().nullable(),
  branch: z.string().nullable(),
  error: z.string().nullable(),
  created_at: z.bigint(),
  updated_at: z.bigint(),
});

const pullRequestSchema = z.object({
  id: z.string(),
  installation_id: z.number(),
  repository: z.string(),
  branch: z.string().nullable(),
  pr_number: z.number(),
  opened_at: z.bigint(),
  merged_by: z.string().nullable(),
  merged_at: z.bigint().nullable(),
  ready_at: z.bigint().nullable(),
  state: z.string().optional(),
  review_state: z.string().nullable().optional(),
  review_updated_at: z.bigint().nullable().optional(),
  checks_count: z.number().nullable().optional(),
  checks_completed_count: z.number().nullable().optional(),
  checks_state: z.string().nullable().optional(),
  checks_conclusion: z.string().nullable().optional(),
  checks_updated_at: z.bigint().nullable().optional(),
});

const taskMessageSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  role: z.string(),
  content: z.string(),
  created_at: z.bigint(),
});

function txidsToMatch(txids: Array<number>) {
  if (txids.length === 0) {
    return;
  }

  if (txids.length === 1) {
    return { txid: txids[0] };
  }

  return { txid: txids };
}

function createCollections(baseUrl: string) {
  const projectsCollection = createCollection(
    electricCollectionOptions({
      schema: projectSchema,
      shapeOptions: {
        url: `${baseUrl}/api/projects/shape`,
      },
      getKey: (p) => p.id,
      onInsert: async ({ transaction }) => {
        const repos = transaction.mutations.map((mutation) => {
          const project = mutation.modified;
          if (!project.repo_url) {
            throw new Error("Project repository URL is required");
          }
          if (project.installation_id === null) {
            throw new Error("Project installation ID is required");
          }

          return {
            id: project.id,
            name: project.name,
            repoUrl: project.repo_url,
            installationId: project.installation_id,
            createdAt: Number(project.created_at),
            updatedAt: Number(project.updated_at),
          };
        });

        const { txid } = await createProjects({ data: { repos } });
        return txid !== undefined ? { txid } : undefined;
      },
      onUpdate: async () => {
        throw new Error("Project updates are not supported");
      },
      onDelete: async () => {
        throw new Error("Project deletion is not supported");
      },
    }),
  );

  const tasksCollection = createCollection(
    electricCollectionOptions({
      schema: taskSchema,
      shapeOptions: {
        url: `${baseUrl}/api/tasks/shape`,
      },
      getKey: (t) => t.id,
      onInsert: async ({ transaction }) => {
        const txids: Array<number> = [];

        for (const mutation of transaction.mutations) {
          const task = mutation.modified;
          if (!task.project_id) {
            throw new Error("Task project is required");
          }

          const { txid } = await createTask({
            data: {
              id: task.id,
              title: task.title,
              projectId: task.project_id,
              runnerSessionId: task.runner_session_id ?? undefined,
              runnerType: task.runner_type ?? undefined,
              status: task.status,
              workspacePath: task.workspace_path ?? undefined,
              createdAt: Number(task.created_at),
              updatedAt: Number(task.updated_at),
            },
          });

          if (txid !== undefined) {
            txids.push(txid);
          }
        }

        return txidsToMatch(txids);
      },
      onUpdate: async ({ transaction }) => {
        const txids: Array<number> = [];

        for (const mutation of transaction.mutations) {
          const title = mutation.modified.title.trim();
          if (title.length === 0) {
            throw new Error("Task title cannot be empty");
          }

          const { txid } = await updateTask({ data: { taskId: String(mutation.key), title } });
          if (txid !== undefined) {
            txids.push(txid);
          }
        }

        return txidsToMatch(txids);
      },
      onDelete: async ({ transaction }) => {
        const txids: Array<number> = [];

        for (const mutation of transaction.mutations) {
          const { txid } = await deleteTask({ data: { taskId: String(mutation.key) } });
          if (txid !== undefined) {
            txids.push(txid);
          }
        }

        return txidsToMatch(txids);
      },
    }),
  );

  const pullRequestsCollection = createCollection(
    electricCollectionOptions({
      schema: pullRequestSchema,
      shapeOptions: {
        url: `${baseUrl}/api/pull-requests/shape`,
      },
      getKey: (pr) => pr.id,
      onInsert: async () => {
        throw new Error("Pull request insertion is not supported");
      },
      onUpdate: async () => {
        throw new Error("Pull request updates are not supported");
      },
      onDelete: async () => {
        throw new Error("Pull request deletion is not supported");
      },
    }),
  );

  const taskMessagesCollection = createCollection(
    electricCollectionOptions({
      schema: taskMessageSchema,
      shapeOptions: {
        url: `${baseUrl}/api/tasks/messages/shape`,
      },
      getKey: (m) => m.id,
      onInsert: async ({ transaction }) => {
        const txids: Array<number> = [];

        for (const mutation of transaction.mutations) {
          const message = mutation.modified;
          const { txid } = await createTaskMessage({
            data: {
              taskId: message.task_id,
              message: {
                id: message.id,
                role: message.role,
                content: message.content,
                createdAt: Number(message.created_at),
              },
            },
          });

          if (txid !== undefined) {
            txids.push(txid);
          }
        }

        return txidsToMatch(txids);
      },
      onUpdate: async () => {
        throw new Error("Task message updates are not supported");
      },
      onDelete: async () => {
        throw new Error("Task message deletion is not supported");
      },
    }),
  );

  return {
    projectsCollection,
    tasksCollection,
    pullRequestsCollection,
    taskMessagesCollection,
  };
}

type Collections = ReturnType<typeof createCollections>;

let collections: Collections | null = null;

function getCollections(): Collections {
  if (typeof window === "undefined") {
    throw new Error("Collections are only available in the browser runtime");
  }

  if (collections === null) {
    collections = createCollections(window.location.origin);
  }

  return collections;
}

function createLazyCollection<TCollection extends object>(
  selectCollection: (collections: Collections) => TCollection,
): TCollection {
  return new Proxy({} as TCollection, {
    get(_target, property) {
      const collection = selectCollection(getCollections());
      const value = Reflect.get(collection, property);

      if (typeof value === "function") {
        return value.bind(collection);
      }

      return value;
    },
    has(_target, property) {
      return property in selectCollection(getCollections());
    },
    ownKeys() {
      return Reflect.ownKeys(selectCollection(getCollections()));
    },
    getOwnPropertyDescriptor(_target, property) {
      return Object.getOwnPropertyDescriptor(selectCollection(getCollections()), property);
    },
    getPrototypeOf() {
      return Object.getPrototypeOf(selectCollection(getCollections()));
    },
  });
}

export const projectsCollection = createLazyCollection((value) => value.projectsCollection);
export const tasksCollection = createLazyCollection((value) => value.tasksCollection);
export const pullRequestsCollection = createLazyCollection((value) => value.pullRequestsCollection);
export const taskMessagesCollection = createLazyCollection((value) => value.taskMessagesCollection);

import { createCollection } from "@tanstack/react-db";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { z } from "zod";
import { apiClient } from "./orpc-client";

const BASE_URL = globalThis.location?.origin;

const projectSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  name: z.string(),
  repo_url: z.string().nullable(),
  installation_id: z.number().nullable(),
  setup_command: z.string().nullable(),
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
  created_at: z.bigint(),
  updated_at: z.bigint(),
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

// ---- Projects collection ----

export const projectsCollection = createCollection(
  electricCollectionOptions({
    schema: projectSchema,
    shapeOptions: {
      url: `${BASE_URL}/api/projects/shape`,
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

      const { txid } = await apiClient.projects.create({ repos });
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

// ---- Tasks collection ----

export const tasksCollection = createCollection(
  electricCollectionOptions({
    schema: taskSchema,
    shapeOptions: {
      url: `${BASE_URL}/api/tasks/shape`,
    },
    getKey: (t) => t.id,
    onInsert: async ({ transaction }) => {
      const txids: Array<number> = [];

      for (const mutation of transaction.mutations) {
        const task = mutation.modified;
        if (!task.project_id) {
          throw new Error("Task project is required");
        }

        const { txid } = await apiClient.tasks.create({
          id: task.id,
          title: task.title,
          projectId: task.project_id,
          status: task.status,
          createdAt: Number(task.created_at),
          updatedAt: Number(task.updated_at),
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

        const { txid } = await apiClient.tasks.update({
          taskId: String(mutation.key),
          title,
        });
        if (txid !== undefined) {
          txids.push(txid);
        }
      }

      return txidsToMatch(txids);
    },
    onDelete: async ({ transaction }) => {
      const txids: Array<number> = [];

      for (const mutation of transaction.mutations) {
        const { txid } = await apiClient.tasks.delete({ taskId: String(mutation.key) });
        if (txid !== undefined) {
          txids.push(txid);
        }
      }

      return txidsToMatch(txids);
    },
  }),
);

// ---- Task messages collection ----

export const taskMessagesCollection = createCollection(
  electricCollectionOptions({
    schema: taskMessageSchema,
    shapeOptions: {
      url: `${BASE_URL}/api/tasks/messages/shape`,
    },
    getKey: (m) => m.id,
    onInsert: async ({ transaction }) => {
      const txids: Array<number> = [];

      for (const mutation of transaction.mutations) {
        const message = mutation.modified;
        const { txid } = await apiClient.tasks.createMessage({
          taskId: message.task_id,
          message: {
            id: message.id,
            role: message.role,
            content: message.content,
            createdAt: Number(message.created_at),
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

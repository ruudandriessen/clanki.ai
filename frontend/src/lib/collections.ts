import { createCollection } from "@tanstack/react-db";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { z } from "zod";

const BASE_URL = globalThis.location?.origin;

const projectSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  repoUrl: z.string().nullable(),
  installationId: z.number().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

const taskSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  projectId: z.string().nullable(),
  title: z.string(),
  status: z.string(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

const taskMessageSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  role: z.string(),
  content: z.string(),
  createdAt: z.number().int(),
});

// ---- Projects collection ----

export const projectsCollection = createCollection(
  electricCollectionOptions({
    schema: projectSchema,
    shapeOptions: {
      url: `${BASE_URL}/api/projects/shape`,
    },
    getKey: (p) => p.id,
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
  }),
);

// ---- Task messages collection ----

export const taskMessagesCollection = createCollection(
  electricCollectionOptions({
    schema: taskMessageSchema,
    shapeOptions: {
      url: `${BASE_URL}/api/tasks/messages/shape`,
    },
    syncMode: "on-demand",
    getKey: (m) => m.id,
  }),
);

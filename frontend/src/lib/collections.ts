import { createCollection } from "@tanstack/react-db";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { z } from "zod";

const BASE_URL = globalThis.location?.origin;

const projectSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  name: z.string(),
  repo_url: z.string().nullable(),
  installation_id: z.number().nullable(),
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
    getKey: (m) => m.id,
  }),
);

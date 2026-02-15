import { mutationResultSchema, oc, z } from "./common";

export const projectSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  repoUrl: z.string().nullable(),
  installationId: z.number().nullable(),
  setupCommand: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const createProjectInputSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  repoUrl: z.string(),
  installationId: z.number(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
});

export const projectsContract = {
  create: oc
    .input(
      z.object({
        repos: z.array(createProjectInputSchema).min(1),
      }),
    )
    .output(mutationResultSchema(z.array(projectSchema))),
  updateSetupCommand: oc
    .input(
      z.object({
        projectId: z.string(),
        setupCommand: z.string().nullable(),
      }),
    )
    .output(mutationResultSchema(projectSchema)),
};

export type Project = z.infer<typeof projectSchema>;
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

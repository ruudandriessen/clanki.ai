import { mutationResultSchema, oc, txidSchema, z } from "./common";

export const taskSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  projectId: z.string().nullable(),
  title: z.string(),
  status: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const taskMessageSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  role: z.string(),
  content: z.string(),
  createdAt: z.number(),
});

export const createTaskInputSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  projectId: z.string(),
  status: z.string().optional(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
});

export const createTaskMessageInputSchema = z.object({
  id: z.string().optional(),
  role: z.string(),
  content: z.string(),
  createdAt: z.number().optional(),
});

export const tasksContract = {
  create: oc.input(createTaskInputSchema).output(mutationResultSchema(taskSchema)),
  update: oc
    .input(
      z.object({
        taskId: z.string(),
        title: z.string(),
      }),
    )
    .output(mutationResultSchema(taskSchema)),
  delete: oc
    .input(
      z.object({
        taskId: z.string(),
      }),
    )
    .output(
      z.object({
        txid: txidSchema.optional(),
      }),
    ),
  createMessage: oc
    .input(
      z.object({
        taskId: z.string(),
        message: createTaskMessageInputSchema,
      }),
    )
    .output(mutationResultSchema(taskMessageSchema)),
};

export type Task = z.infer<typeof taskSchema>;
export type TaskMessage = z.infer<typeof taskMessageSchema>;
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;
export type CreateTaskMessageInput = z.infer<typeof createTaskMessageInputSchema>;

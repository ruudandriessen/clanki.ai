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

export const taskRunSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  tool: z.string(),
  status: z.string(),
  inputMessageId: z.string().nullable(),
  outputMessageId: z.string().nullable(),
  sandboxId: z.string().nullable(),
  sessionId: z.string().nullable(),
  initiatedByUserId: z.string().nullable(),
  provider: z.string(),
  model: z.string(),
  error: z.string().nullable(),
  startedAt: z.number().nullable(),
  finishedAt: z.number().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
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
  createRun: oc
    .input(
      z.object({
        taskId: z.string(),
        messageId: z.string().optional(),
        provider: z.string().optional(),
        model: z.string().optional(),
      }),
    )
    .output(taskRunSchema),
};

export type Task = z.infer<typeof taskSchema>;
export type TaskMessage = z.infer<typeof taskMessageSchema>;
export type TaskRun = z.infer<typeof taskRunSchema>;
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;
export type CreateTaskMessageInput = z.infer<typeof createTaskMessageInputSchema>;

import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@/server/db/schema";
import { DEFAULT_OPENCODE_PROVIDER } from "@/server/lib/opencode";
import { createTaskRunCallbackToken } from "@/server/lib/task-run-callback-token";
import { dbMiddleware } from "../middleware";
import { badRequest, notFound } from "./common";

export const startTaskRun = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .inputValidator(
    z.object({
      taskId: z.string(),
    }),
  )
  .handler(async ({ data: input, context }) => {
    const task = await context.db.query.tasks.findFirst({
      where: eq(schema.tasks.id, input.taskId),
      columns: {
        id: true,
        runnerSessionId: true,
        runnerType: true,
        workspacePath: true,
      },
    });

    if (!task) {
      notFound("Task not found");
    }

    if (task.runnerType !== "local-worktree" || !task.runnerSessionId || !task.workspacePath) {
      badRequest("Task is not linked to a local runner session");
    }

    const executionId = crypto.randomUUID();
    const issuedAt = Date.now();

    await context.db
      .update(schema.tasks)
      .set({
        error: null,
        status: "running",
        updatedAt: issuedAt,
      })
      .where(eq(schema.tasks.id, input.taskId));

    return {
      callbackToken: createTaskRunCallbackToken({
        executionId,
        taskId: task.id,
        provider: DEFAULT_OPENCODE_PROVIDER,
        issuedAt,
      }),
      executionId,
      runnerSessionId: task.runnerSessionId,
      runnerType: task.runnerType,
      workspacePath: task.workspacePath,
    };
  });

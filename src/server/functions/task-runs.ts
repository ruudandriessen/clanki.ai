import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@/server/db/schema";
import { DEFAULT_OPENCODE_PROVIDER } from "@/server/lib/opencode";
import { createTaskRunCallbackToken } from "@/server/lib/task-run-callback-token";
import { authMiddleware } from "../middleware";
import { badRequest, getOrgId, notFound } from "./common";

export const startTaskRun = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      taskId: z.string(),
    }),
  )
  .handler(async ({ data: input, context }) => {
    const orgId = getOrgId(context);

    if (!orgId) {
      badRequest("No active organization");
    }

    const task = await context.db.query.tasks.findFirst({
      where: and(eq(schema.tasks.id, input.taskId), eq(schema.tasks.organizationId, orgId)),
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
      .where(and(eq(schema.tasks.id, input.taskId), eq(schema.tasks.organizationId, orgId)));

    return {
      callbackToken: createTaskRunCallbackToken(
        {
          executionId,
          taskId: task.id,
          organizationId: orgId,
          userId: context.session.user.id,
          provider: DEFAULT_OPENCODE_PROVIDER,
          issuedAt,
        },
        context.env,
      ),
      executionId,
      runnerSessionId: task.runnerSessionId,
      runnerType: task.runnerType,
      workspacePath: task.workspacePath,
    };
  });

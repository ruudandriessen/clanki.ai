import { desc, eq } from "drizzle-orm";
import * as schema from "../../db/schema";

import type { AppDb } from "../../db/client";

export async function completeTask(args: { db: AppDb; taskId: string }): Promise<void> {
    await args.db
        .update(schema.tasks)
        .set({ status: "open", error: null, updatedAt: Date.now() })
        .where(eq(schema.tasks.id, args.taskId));
}

export async function markTaskFailed(args: {
    db: AppDb;
    taskId: string;
    message: string;
}): Promise<void> {
    try {
        await args.db
            .update(schema.tasks)
            .set({ status: "open", error: args.message, updatedAt: Date.now() })
            .where(eq(schema.tasks.id, args.taskId));
    } catch {}
}

export async function insertAssistantTaskMessage(args: {
    db: AppDb;
    organizationId: string;
    taskId: string;
    content: string;
}): Promise<string> {
    const { db, organizationId, taskId, content } = args;

    const taskMessageId = crypto.randomUUID();
    const createdAt = await getNextTaskMessageTimestamp(db, taskId);

    await db.insert(schema.taskMessages).values({
        id: taskMessageId,
        organizationId,
        taskId,
        role: "assistant",
        content,
        createdAt,
    });

    return taskMessageId;
}

async function getNextTaskMessageTimestamp(db: AppDb, taskId: string): Promise<number> {
    const now = Date.now();
    const latest = await db.query.taskMessages.findFirst({
        where: eq(schema.taskMessages.taskId, taskId),
        columns: { createdAt: true },
        orderBy: desc(schema.taskMessages.createdAt),
    });

    if (!latest?.createdAt) {
        return now;
    }

    return latest.createdAt >= now ? latest.createdAt + 1 : now;
}

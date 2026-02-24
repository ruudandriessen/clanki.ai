import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { clauseToString } from "@/server/lib/clause-to-string";
import { electricFn } from "@/server/lib/electric";
import { requireSession } from "@/server/requireSession";

export const Route = createFileRoute("/api/tasks/messages/shape")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await requireSession(request);
        const orgId = session.session.activeOrganizationId ?? null;

        if (!orgId) {
          return Response.json({ error: "No active organization" }, { status: 400 });
        }

        return electricFn({
          request,
          table: "task_messages",
          where: clauseToString(eq(schema.taskMessages.organizationId, orgId)),
        });
      },
    },
  },
});

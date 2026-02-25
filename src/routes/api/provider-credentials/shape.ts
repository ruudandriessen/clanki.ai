import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { clauseToString } from "@/server/lib/clause-to-string";
import { electricFn } from "@/server/lib/electric";
import { requireSession } from "@/server/requireSession";

export const Route = createFileRoute("/api/provider-credentials/shape")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await requireSession(request);

        return electricFn({
          request,
          table: "user_provider_credentials",
          where: clauseToString(eq(schema.userProviderCredentials.userId, session.user.id)),
        });
      },
    },
  },
});

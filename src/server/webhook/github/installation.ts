import { eq } from "drizzle-orm";
import { installations } from "../../db/schema";

import type { AppDb } from "../../db/client";
import type { EmitterWebhookEvent } from "@octokit/webhooks";

export async function handleInstallation(
    event: EmitterWebhookEvent<"installation">,
    db: AppDb,
): Promise<void> {
    const { action, installation } = event.payload;

    if (!installation.account) {
        console.error("Installation event received without account information");
        return;
    }

    switch (action) {
        case "created": {
            const accountLogin =
                "login" in installation.account
                    ? installation.account.login
                    : installation.account.slug;
            const accountType =
                "type" in installation.account ? installation.account.type : "Organization";
            const now = Date.now();

            await db
                .insert(installations)
                .values({
                    installationId: installation.id,
                    accountLogin,
                    accountType,
                    createdAt: now,
                })
                .onConflictDoUpdate({
                    target: installations.installationId,
                    set: {
                        accountLogin,
                        accountType,
                        updatedAt: now,
                        deletedAt: null,
                    },
                });

            console.log(`App installed: ${accountLogin} (${installation.id})`);
            break;
        }

        case "deleted": {
            await db
                .update(installations)
                .set({ deletedAt: Date.now() })
                .where(eq(installations.installationId, installation.id));

            const accountLogin =
                "login" in installation.account
                    ? installation.account.login
                    : "slug" in installation.account
                      ? installation.account.slug
                      : "unknown";
            console.log(`App uninstalled: ${accountLogin} (${installation.id})`);
            break;
        }
    }
}

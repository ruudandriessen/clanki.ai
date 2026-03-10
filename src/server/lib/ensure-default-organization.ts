import { and, eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";

type OrganizationCreator = {
    api: {
        createOrganization(args: {
            body: {
                name: string;
                slug: string;
                userId: string;
            };
        }): Promise<unknown>;
    };
};

type DbLike = {
    select: (...args: any[]) => any;
};

type UserLike = {
    id: string;
    name: string;
    email: string;
};

function buildOrganizationSlug(user: UserLike): string {
    const slug = user.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    return `${slug}-${user.id.slice(0, 8)}`;
}

export async function ensureDefaultOrganizationForUser(args: {
    auth: OrganizationCreator;
    db: DbLike;
    user: UserLike;
}) {
    const { auth, db, user } = args;

    const existingMembership = await db
        .select({ organizationId: schema.member.organizationId })
        .from(schema.member)
        .where(eq(schema.member.userId, user.id))
        .limit(1);

    if (existingMembership.length > 0) {
        return;
    }

    const pendingInvitation = await db
        .select({ id: schema.invitation.id })
        .from(schema.invitation)
        .where(
            and(eq(schema.invitation.email, user.email), eq(schema.invitation.status, "pending")),
        )
        .limit(1);

    if (pendingInvitation.length > 0) {
        return;
    }

    await auth.api.createOrganization({
        body: {
            name: `${user.name}'s Organization`,
            slug: buildOrganizationSlug(user),
            userId: user.id,
        },
    });
}

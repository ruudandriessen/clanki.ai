import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { badGateway, badRequest, forbidden } from "./common";
import { authMiddleware } from "../middleware";

export const fetchInstallations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { db, session } = context;
    const userId = session.session.userId;

    const githubAccount = await db.query.account.findFirst({
      where: and(eq(schema.account.providerId, "github"), eq(schema.account.userId, userId)),
    });

    if (!githubAccount?.accessToken) return [];

    const ghRes = await fetch("https://api.github.com/user/installations", {
      headers: {
        Authorization: `Bearer ${githubAccount.accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "clanki-worker",
      },
    });

    if (!ghRes.ok) badGateway("Failed to fetch GitHub installations");

    const ghData = (await ghRes.json()) as {
      installations: Array<{ id: number; account: { login: string; type: string } }>;
    };

    const ghInstallationIds = ghData.installations.map((i) => i.id);

    if (ghInstallationIds.length === 0) return [];

    return db.query.installations.findMany({
      where: and(
        inArray(schema.installations.installationId, ghInstallationIds),
        isNull(schema.installations.deletedAt),
      ),
    });
  });

export const fetchInstallationRepos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ installationId: z.number().int() }))
  .handler(async ({ data: input, context }) => {
    const { db, session } = context;
    const userId = session.session.userId;

    const githubAccount = await db.query.account.findFirst({
      where: and(eq(schema.account.providerId, "github"), eq(schema.account.userId, userId)),
    });

    if (!githubAccount?.accessToken) badRequest("No GitHub account linked");

    const repos: Array<{
      id: number;
      fullName: string;
      name: string;
      htmlUrl: string;
      private: boolean;
    }> = [];
    let page = 1;

    while (true) {
      const ghRes = await fetch(
        `https://api.github.com/user/installations/${input.installationId}/repositories?per_page=100&page=${page}`,
        {
          headers: {
            Authorization: `Bearer ${githubAccount.accessToken}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "clanki-worker",
          },
        },
      );

      if (!ghRes.ok) {
        if (ghRes.status === 403 || ghRes.status === 404) forbidden("Installation not accessible");
        badGateway("Failed to fetch repos from GitHub");
      }

      const data = (await ghRes.json()) as {
        repositories: Array<{
          id: number;
          full_name: string;
          name: string;
          html_url: string;
          private: boolean;
        }>;
        total_count: number;
      };

      for (const r of data.repositories) {
        repos.push({
          id: r.id,
          fullName: r.full_name,
          name: r.name,
          htmlUrl: r.html_url,
          private: r.private,
        });
      }

      if (repos.length >= data.total_count) break;
      page++;
    }

    return repos;
  });

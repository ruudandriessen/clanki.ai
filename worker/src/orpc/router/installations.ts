import { and, eq, inArray, isNull } from "drizzle-orm";
import * as schema from "../../db/schema";
import { badGateway, badRequest, forbidden } from "./errors";
import { os } from "./context";

export const installationsRouter = {
  list: os.installations.list.handler(async ({ context }) => {
    const db = context.db;
    const userId = context.session.session.userId;

    const githubAccount = await db.query.account.findFirst({
      where: and(eq(schema.account.providerId, "github"), eq(schema.account.userId, userId)),
    });

    if (!githubAccount?.accessToken) {
      return [];
    }

    const ghRes = await fetch("https://api.github.com/user/installations", {
      headers: {
        Authorization: `Bearer ${githubAccount.accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "clanki-worker",
      },
    });

    if (!ghRes.ok) {
      badGateway("Failed to fetch GitHub installations");
    }

    const ghData = (await ghRes.json()) as {
      installations: Array<{
        id: number;
        account: { login: string; type: string };
      }>;
    };

    const ghInstallationIds = ghData.installations.map((installation) => installation.id);
    if (ghInstallationIds.length === 0) {
      return [];
    }

    return db.query.installations.findMany({
      where: and(
        inArray(schema.installations.installationId, ghInstallationIds),
        isNull(schema.installations.deletedAt),
      ),
    });
  }),
  repos: os.installations.repos.handler(async ({ input, context }) => {
    const db = context.db;
    const userId = context.session.session.userId;

    const githubAccount = await db.query.account.findFirst({
      where: and(eq(schema.account.providerId, "github"), eq(schema.account.userId, userId)),
    });

    if (!githubAccount?.accessToken) {
      badRequest("No GitHub account linked");
    }

    const repos: Array<{
      id: number;
      fullName: string;
      name: string;
      htmlUrl: string;
      private: boolean;
    }> = [];

    let page = 1;
    const perPage = 100;

    while (true) {
      const ghRes = await fetch(
        `https://api.github.com/user/installations/${input.installationId}/repositories?per_page=${perPage}&page=${page}`,
        {
          headers: {
            Authorization: `Bearer ${githubAccount.accessToken}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "clanki-worker",
          },
        },
      );

      if (!ghRes.ok) {
        if (ghRes.status === 403 || ghRes.status === 404) {
          forbidden("Installation not accessible");
        }

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

      for (const repository of data.repositories) {
        repos.push({
          id: repository.id,
          fullName: repository.full_name,
          name: repository.name,
          htmlUrl: repository.html_url,
          private: repository.private,
        });
      }

      if (repos.length >= data.total_count) {
        break;
      }
      page++;
    }

    return repos;
  }),
};

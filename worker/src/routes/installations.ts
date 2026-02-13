import { Hono } from "hono";
import { and, eq, isNull, inArray } from "drizzle-orm";
import * as schema from "../db/schema";
import type { AppDb } from "../db/client";

type Env = {
  Variables: {
    db: AppDb;
    session: {
      session: { userId: string };
      user: { id: string; name: string; email: string; image?: string | null };
    };
  };
};

const installations = new Hono<Env>();

// GET /api/installations — list active installations the user can access
installations.get("/", async (c) => {
  const db = c.get("db");
  const { session } = c.get("session");

  const githubAccount = await db.query.account.findFirst({
    where: and(eq(schema.account.providerId, "github"), eq(schema.account.userId, session.userId)),
  });

  if (!githubAccount?.accessToken) {
    return c.json([]);
  }

  const ghRes = await fetch("https://api.github.com/user/installations", {
    headers: {
      Authorization: `Bearer ${githubAccount.accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "clanki-worker",
    },
  });

  if (!ghRes.ok) {
    return c.json({ error: "Failed to fetch GitHub installations" }, 502);
  }

  const ghData = (await ghRes.json()) as {
    installations: Array<{
      id: number;
      account: { login: string; type: string };
    }>;
  };

  const ghInstallationIds = ghData.installations.map((i) => i.id);

  if (ghInstallationIds.length === 0) {
    return c.json([]);
  }

  const dbInstallations = await db.query.installations.findMany({
    where: and(
      inArray(schema.installations.installationId, ghInstallationIds),
      isNull(schema.installations.deletedAt),
    ),
  });

  return c.json(dbInstallations);
});

// GET /api/installations/:installationId/repos — list repos for an installation
installations.get("/:installationId/repos", async (c) => {
  const db = c.get("db");
  const { session } = c.get("session");
  const installationId = c.req.param("installationId");

  const githubAccount = await db.query.account.findFirst({
    where: and(eq(schema.account.providerId, "github"), eq(schema.account.userId, session.userId)),
  });

  if (!githubAccount?.accessToken) {
    return c.json({ error: "No GitHub account linked" }, 400);
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
      `https://api.github.com/user/installations/${installationId}/repositories?per_page=${perPage}&page=${page}`,
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
        return c.json({ error: "Installation not accessible" }, 403);
      }
      return c.json({ error: "Failed to fetch repos from GitHub" }, 502);
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

  return c.json(repos);
});

export { installations };

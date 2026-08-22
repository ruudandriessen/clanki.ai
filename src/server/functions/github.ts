import { createServerFn } from "@tanstack/react-start";
import { extractOrgRepoFromUrl } from "@/lib/pull-request";
import { listGithubRepos } from "@/server/lib/list-github-repos";
import { listRepositoryPullRequests } from "@/server/lib/list-repository-pull-requests";
import { dbMiddleware } from "../middleware";

export const listAccessibleGithubRepos = createServerFn({ method: "GET" }).handler(async () => {
  return listGithubRepos();
});

export const listProjectPullRequests = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .handler(async ({ context }) => {
    const projects = await context.db.query.projects.findMany({
      columns: { repoUrl: true },
    });
    const repositories = [
      ...new Set(
        projects
          .map((project) => extractOrgRepoFromUrl(project.repoUrl))
          .filter((repository): repository is string => repository !== null),
      ),
    ];

    return repositories.flatMap((repository) => listRepositoryPullRequests(repository));
  });

import type { GithubRepo } from "@/lib/github-repo";
import { runGhJson } from "./gh";

type GithubApiRepo = {
  full_name?: string;
  html_url?: string;
  name?: string;
  private?: boolean;
};

export function listGithubRepos(): GithubRepo[] {
  const repos = runGhJson<GithubApiRepo[]>([
    "api",
    "user/repos?per_page=100&affiliation=owner,collaborator,organization_member&sort=updated",
    "--paginate",
  ]);

  return repos
    .map((repo) => {
      const fullName = repo.full_name?.trim();
      const htmlUrl = repo.html_url?.trim();
      const name = repo.name?.trim();
      if (!fullName || !htmlUrl || !name) {
        return null;
      }

      return {
        fullName,
        htmlUrl,
        name,
        private: repo.private === true,
      };
    })
    .filter((repo): repo is GithubRepo => repo !== null);
}

export type PullRequestStatus = "open" | "merged" | "closed" | "draft";

export function getPullRequestStatus(pr: {
  state?: string;
  merged_at: bigint | null;
  ready_at: bigint | null;
}): PullRequestStatus {
  switch (pr.state) {
    case "draft":
      return "draft";
    case "closed":
      return "closed";
    case "merged":
      return "merged";
    case "open":
      return "open";
    default: {
      if (pr.merged_at !== null) {
        return "merged";
      }
      return pr.ready_at === null ? "draft" : "open";
    }
  }
}

export function extractOrgRepoFromUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/");
    if (pathParts.length < 3) {
      return null;
    }
    return pathParts.slice(1, 3).join("/");
  } catch {
    return null;
  }
}

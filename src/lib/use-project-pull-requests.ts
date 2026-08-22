import { useQuery } from "@tanstack/react-query";
import { listProjectPullRequests } from "@/server/functions/github";

export function useProjectPullRequests() {
  return useQuery({
    queryKey: ["project-pull-requests"],
    queryFn: () => listProjectPullRequests(),
    refetchInterval: 60_000,
  });
}

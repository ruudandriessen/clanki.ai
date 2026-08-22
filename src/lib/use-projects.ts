import { useQuery } from "@tanstack/react-query";
import { listProjects } from "@/server/functions/projects";

export const PROJECTS_QUERY_KEY = ["projects"] as const;

export function useProjects() {
  return useQuery({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: () => listProjects(),
  });
}

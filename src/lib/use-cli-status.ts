import { useQuery } from "@tanstack/react-query";
import { getCliStatus } from "@/server/functions/cli-status";

const CLI_STATUS_QUERY_KEY = ["cli-status"] as const;

export function useCliStatus() {
  return useQuery({
    queryKey: CLI_STATUS_QUERY_KEY,
    queryFn: () => getCliStatus(),
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

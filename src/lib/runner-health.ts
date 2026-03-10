import { useQuery } from "@tanstack/react-query";
import { getDesktopRunnerHealth } from "@/lib/desktop-runner";
import { isDesktopApp } from "@/lib/is-desktop-app";

const RUNNER_HEALTH_QUERY_KEY = ["runner-health"] as const;

export function useRunnerHealth() {
  const desktopApp = isDesktopApp();

  return useQuery({
    queryKey: RUNNER_HEALTH_QUERY_KEY,
    queryFn: getDesktopRunnerHealth,
    enabled: desktopApp,
    refetchInterval: 5_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

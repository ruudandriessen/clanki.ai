import { useQuery } from "@tanstack/react-query";
import type { ArchitectureDiff } from "@/lib/architecture-diff";
import { getDesktopRunnerArchitectureDiff } from "@/lib/desktop-runner";
import { isDesktopApp } from "@/lib/is-desktop-app";

type UseRunnerArchitectureDiffArgs = {
  directory: string | null;
  enabled?: boolean;
  refetchIntervalMs?: number;
};

export function useRunnerArchitectureDiff({
  directory,
  enabled = true,
  refetchIntervalMs,
}: UseRunnerArchitectureDiffArgs) {
  const desktopApp = isDesktopApp();
  const normalizedDirectory = directory?.trim() ?? "";

  return useQuery<ArchitectureDiff>({
    queryKey: ["runner-architecture-diff", normalizedDirectory],
    queryFn: async () =>
      await getDesktopRunnerArchitectureDiff({
        directory: normalizedDirectory,
      }),
    enabled: enabled && desktopApp && normalizedDirectory.length > 0,
    gcTime: Number.POSITIVE_INFINITY,
    refetchInterval: refetchIntervalMs,
    refetchOnWindowFocus: false,
    staleTime: 2_000,
  });
}

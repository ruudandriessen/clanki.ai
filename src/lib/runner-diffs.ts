import { useQuery } from "@tanstack/react-query";
import type { DesktopRunnerDiff } from "@/lib/desktop-runner";
import { getDesktopRunnerDiff } from "@/lib/desktop-runner";
import { isDesktopApp } from "@/lib/is-desktop-app";

type UseRunnerDiffArgs = {
  directory: string | null;
  enabled?: boolean;
  refetchIntervalMs?: number;
};

export function useRunnerDiff({ directory, enabled = true, refetchIntervalMs }: UseRunnerDiffArgs) {
  const desktopApp = isDesktopApp();
  const normalizedDirectory = directory?.trim() ?? "";

  return useQuery<DesktopRunnerDiff[]>({
    queryKey: ["runner-diff", normalizedDirectory],
    queryFn: async () =>
      await getDesktopRunnerDiff({
        directory: normalizedDirectory,
      }),
    enabled: enabled && desktopApp && normalizedDirectory.length > 0,
    gcTime: Number.POSITIVE_INFINITY,
    refetchInterval: refetchIntervalMs,
    refetchOnWindowFocus: false,
    staleTime: 2_000,
  });
}

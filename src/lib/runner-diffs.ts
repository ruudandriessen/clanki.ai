import { useQuery } from "@tanstack/react-query";
import { getDesktopRunnerDiff } from "@/lib/desktop-runner";
import { isDesktopApp } from "@/lib/is-desktop-app";

import type { DesktopRunnerDiff } from "@/lib/desktop-runner";

type UseRunnerDiffArgs = {
    directory: string | null;
    enabled?: boolean;
    refetchIntervalMs?: number;
    sessionId: string | null;
};

export function useRunnerDiff({
    directory,
    enabled = true,
    refetchIntervalMs,
    sessionId,
}: UseRunnerDiffArgs) {
    const desktopApp = isDesktopApp();
    const normalizedDirectory = directory?.trim() ?? "";
    const normalizedSessionId = sessionId?.trim() ?? "";

    return useQuery<DesktopRunnerDiff[]>({
        queryKey: ["runner-diff", normalizedDirectory, normalizedSessionId],
        queryFn: async () =>
            await getDesktopRunnerDiff({
                directory: normalizedDirectory,
                sessionId: normalizedSessionId,
            }),
        enabled:
            enabled &&
            desktopApp &&
            normalizedDirectory.length > 0 &&
            normalizedSessionId.length > 0,
        gcTime: Number.POSITIVE_INFINITY,
        refetchInterval: refetchIntervalMs,
        refetchOnWindowFocus: false,
        staleTime: 2_000,
    });
}

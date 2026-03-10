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

export function getPullRequestButtonClasses(status: PullRequestStatus): string {
    switch (status) {
        case "merged":
            return "border-[#8250df] bg-[#8250df] text-white hover:border-[#6f42c1] hover:bg-[#6f42c1]";
        case "closed":
            return "border-[#cf222e] bg-[#cf222e] text-white hover:border-[#a40e26] hover:bg-[#a40e26]";
        case "draft":
            return "border-[#6e7781] bg-[#6e7781] text-white hover:border-[#57606a] hover:bg-[#57606a]";
        default:
            return "";
    }
}

export function humanizePullRequestStatus(status: string | null): string {
    if (!status) {
        return "unknown";
    }

    return status.replaceAll("_", " ");
}

export function getReviewStatusClasses(reviewState: string | null): string {
    switch (reviewState) {
        case "approved":
            return "border-emerald-300 bg-emerald-100 text-emerald-900";
        case "changes_requested":
            return "border-red-300 bg-red-100 text-red-900";
        case "dismissed":
            return "border-zinc-300 bg-zinc-100 text-zinc-800";
        default:
            return "border-border bg-card text-muted-foreground";
    }
}

export function getChecksStatusClasses(
    checksState: string | null,
    checksConclusion: string | null,
): string {
    switch (checksConclusion) {
        case "success":
            return "border-emerald-300 bg-emerald-100 text-emerald-900";
        case "failure":
        case "cancelled":
        case "timed_out":
        case "action_required":
        case "startup_failure":
        case "stale":
            return "border-red-300 bg-red-100 text-red-900";
    }

    switch (checksState) {
        case "queued":
        case "in_progress":
        case "requested":
        case "pending":
        case "waiting":
            return "border-amber-300 bg-amber-100 text-amber-900";
        default:
            return "border-border bg-card text-muted-foreground";
    }
}

function formatChecksStatus(checksState: string | null, checksConclusion: string | null): string {
    if (checksState && checksConclusion) {
        return `${humanizePullRequestStatus(checksState)} (${humanizePullRequestStatus(checksConclusion)})`;
    }

    return humanizePullRequestStatus(checksState ?? checksConclusion);
}

export function formatChecksProgress(
    checksCompletedCount: number | null,
    checksCount: number | null,
    checksState: string | null,
    checksConclusion: string | null,
): string {
    if (checksCount != null && checksCount > 0) {
        const completedChecks = Math.min(checksCompletedCount ?? 0, checksCount);
        const pendingChecks = Math.max(0, checksCount - completedChecks);

        if (pendingChecks > 0) {
            return `${completedChecks}/${checksCount} checks done, ${pendingChecks} pending`;
        }

        return `${completedChecks}/${checksCount} checks done`;
    }

    return formatChecksStatus(checksState, checksConclusion);
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

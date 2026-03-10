export const USER_ACCESS_STATUS = {
    approved: "approved",
    pending: "pending",
} as const;

export function isApprovedAccessStatus(
    accessStatus: string | null | undefined,
): accessStatus is typeof USER_ACCESS_STATUS.approved {
    return accessStatus === USER_ACCESS_STATUS.approved;
}

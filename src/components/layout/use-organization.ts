import { useEffect } from "react";
import { authClient } from "../../lib/auth-client";

export function useOrganization() {
    const activeOrg = authClient.useActiveOrganization();
    const orgs = authClient.useListOrganizations();

    // Auto-set active org if none is set but user has orgs.
    useEffect(() => {
        if (!activeOrg.isPending && !activeOrg.data && orgs.data && orgs.data.length > 0) {
            authClient.organization.setActive({ organizationId: orgs.data[0].id });
        }
    }, [activeOrg.isPending, activeOrg.data, orgs.data]);

    return activeOrg;
}

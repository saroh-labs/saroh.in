/** Releases test data: a flag and a list of businesses, nothing switched. */
import type { AdminFlag, AdminOrganization } from "@/lib/control-plane";

export function flag(
    key: string,
    shownAs: string,
    group: AdminFlag["metadata"]["group"],
    rest: Partial<AdminFlag> = {},
): AdminFlag {
    return {
        key,
        metadata: {
            shownAs,
            group,
            purpose: `Makes ${shownAs} available to a business.`,
            owner: "Release manager",
            reviewBy: "2027-03-31",
            removeWhen: `${shownAs} is on for every business.`,
        },
        enabledByDefault: null,
        overrides: [],
        ...rest,
    };
}

/** `o1`…`oN`, named "Org 1"…"Org N". */
export function orgs(count: number): AdminOrganization[] {
    return Array.from({ length: count }, (_, i) => ({
        id: `o${i + 1}`,
        name: `Org ${i + 1}`,
        slug: `org-${i + 1}`,
    }));
}

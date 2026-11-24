import { announce } from "@/lib/query/broadcast";
import { getBrowserQueryClient } from "@/lib/query/client";
import { ORGANIZATIONS_KEY } from "@/lib/query/keys";

/** Drop everything this tab holds: another business, or no one, is next. */
export function clearAll(): void {
    if (typeof window === "undefined") return;
    getBrowserQueryClient().clear();
}

/** The business changed here: clear, and tell the other tabs. */
export function afterSwitch(): void {
    clearAll();
    announce("switch");
}

/** Signed out here: clear, and tell the other tabs. */
export function afterSignOut(): void {
    clearAll();
    announce("signout");
}

/**
 * The business list changed (created, renamed, left or deleted, an
 * invitation taken): read it again on its next use. The only writers of
 * `['organizations']`, besides another tab's switch.
 */
export function invalidateOrganizations(): void {
    if (typeof window === "undefined") return;
    void getBrowserQueryClient().invalidateQueries({
        queryKey: ORGANIZATIONS_KEY,
    });
}

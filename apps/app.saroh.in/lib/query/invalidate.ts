import type { QueryClient } from "@tanstack/react-query";

import { bumpGateEpoch } from "@/lib/access/gate-epoch";
import { announce } from "@/lib/query/broadcast";
import { getBrowserQueryClient } from "@/lib/query/client";
import { isSettingsQuery } from "@/lib/query/freshness";
import { isOrgKey, ORGANIZATIONS_KEY } from "@/lib/query/keys";
import { forgetRecents } from "@/lib/search/recents";

/** Drop everything this tab holds: another business, or no one, is next. */
export function clearAll(): void {
    if (typeof window === "undefined") return;
    getBrowserQueryClient().clear();
}

/**
 * The business changed here: tell the other tabs. Nothing is dropped: every
 * key carries its business (`[domain, orgId, ...]`), so the one left stays
 * cached beside the new one and a switch back draws at once (owner, 25 Nov
 * 2026). Sign-out is the only clear.
 */
export function afterSwitch(): void {
    announce("switch");
}

/** Signed out here: clear, and tell the other tabs. */
export function afterSignOut(): void {
    clearAll();
    forgetRecents();
    announce("signout");
}

/** The person this tab's cache was filled for; null until the first. */
let cacheUser: string | null = null;

/**
 * The signed-in person, as this render's server read them. When it isn't
 * the one the cache was filled for (signed out on accounts and a teammate
 * signed in, on a shared device), everything held is dropped, the settings
 * kept for the visit included, and the search recents with it. A switch of
 * business is not a change of person: it keeps the cache (owner, #1472).
 * Answers whether it cleared.
 */
export function keepForUser(client: QueryClient, userId: string): boolean {
    const changed = cacheUser !== null && cacheUser !== userId;
    cacheUser = userId;
    if (!changed) return false;
    client.clear();
    forgetRecents();
    return true;
}

/** For tests: forget whose cache it was. */
export function resetCacheUser(): void {
    cacheUser = null;
}

/**
 * The business list as read now: drop every business's cache that isn't on
 * it (removed or left elsewhere), so nothing of it is held for the visit.
 */
export function dropLeftBusinesses(
    client: QueryClient,
    organizations: { id: string }[],
): void {
    client.removeQueries({
        // `['organizations']` itself is one long, and no business's.
        predicate: (q) =>
            q.queryKey.length > 1 &&
            !organizations.some((o) => isOrgKey(q.queryKey, o.id)),
    });
}

/**
 * The business list changed (created, renamed, left or deleted, an
 * invitation taken): read it again on its next use. The only writers of
 * `['organizations']`, besides another tab's switch.
 */
export function invalidateOrganizations(): void {
    if (typeof window === "undefined") return;
    // A role or membership may have changed: the server's kept gate answers
    // for this browser are passed over (`gate-epoch.ts`).
    bumpGateEpoch();
    void getBrowserQueryClient().invalidateQueries({
        queryKey: ORGANIZATIONS_KEY,
    });
}

/**
 * A save on a screen not yet on React Query (`runAction`'s `staleOrg`):
 * every query this business holds is marked stale without reading it
 * again, so a migrated screen opened next reads afresh, and nothing
 * refetches now.
 */
export function markOrgStale(orgId: string): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve();
    return getBrowserQueryClient().invalidateQueries({
        predicate: (q) => isOrgKey(q.queryKey, orgId),
        refetchType: "none",
    });
}

/**
 * Every settings read this tab holds is read again (the shown ones now, the
 * rest on their next use): kept for the visit, they change only when told
 * (`freshness.ts`).
 */
export function invalidateSettings(client: QueryClient): Promise<void> {
    return client.invalidateQueries({ predicate: isSettingsQuery });
}

/**
 * A save changed a setting the shell draws (a module on or off, the plan,
 * a site, a storefront, Track stock, Ask AI): this tab reads its settings
 * again, and the other tabs are told to. Call it after the save worked.
 */
export function afterSettingsSave(): void {
    if (typeof window === "undefined") return;
    // Before the reads below: they must miss the server's kept gate answers.
    bumpGateEpoch();
    void invalidateSettings(getBrowserQueryClient());
    announce("settings");
}

"use client";

import { QueryClientContext, useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useContext, useMemo } from "react";

import {
    afterSettingsSave,
    invalidateOrganizations,
} from "@/lib/query/invalidate";
import { useOrgId, useOrgIdOrNull } from "@/lib/query/org";
import { isRqRoute } from "@/lib/query/rq-routes";

import {
    organizationRead,
    peopleRead,
    profileRead,
    settingsKeys,
} from "./queries";

/*
 * Team, Your profile and Business are `settings` reads (`freshness.ts`):
 * held for the visit, so a tab looked at again is drawn with no read; each
 * save here says what it changed (`useSettingsSave`).
 */
export function usePeopleScreen() {
    return useQuery(peopleRead.options(useOrgId(), {}));
}

export function useProfileScreen() {
    return useQuery(profileRead.options(useOrgId(), {}));
}

export function useOrganizationScreen() {
    return useQuery(organizationRead.options(useOrgId(), {}));
}

/**
 * How a Settings part saves (DEC-259): `orgId` goes last to each write (the
 * action runs it through `writeAsOrg`, refusing a moved tab and
 * revalidating nothing), then `saved()` once it landed: the tab shown reads
 * again and the other Settings tabs on their next visit. `shell` for a save
 * the shell draws (who is paused, the plan's seats): `afterSettingsSave()`
 * reads the shell again and tells the other tabs. `organizations` for one
 * that may change the person's business list (a role, a membership, a
 * name). Nothing is drawn by the server again.
 *
 * Outside a business (a test, no provider) `orgId` is undefined and the
 * action keeps its own revalidation.
 */
export interface SettingsSave {
    orgId: string | undefined;
    saved: (opts?: { organizations?: boolean; shell?: boolean }) => void;
}

/**
 * Mark every Settings tab this business holds stale, without reading:
 * for a save whose answer the screen already shows (a photo, a switch).
 */
export function useSettingsStale(): () => void {
    const qc = useContext(QueryClientContext);
    const orgId = useOrgIdOrNull();
    return useCallback(() => {
        if (!qc || !orgId) return;
        void qc.invalidateQueries({
            queryKey: settingsKeys(orgId),
            refetchType: "none",
        });
    }, [qc, orgId]);
}

export function useSettingsSave(): SettingsSave {
    const qc = useContext(QueryClientContext);
    const orgId = useOrgIdOrNull() ?? undefined;
    return useMemo(
        () => ({
            orgId: qc ? orgId : undefined,
            saved: ({ organizations = false, shell = false } = {}) => {
                if (!qc || !orgId) return;
                // The shell's settings and these tabs are all `settings`
                // reads: one invalidation reads both again.
                if (shell) afterSettingsSave();
                else
                    void qc.invalidateQueries({
                        queryKey: settingsKeys(orgId),
                    });
                if (organizations) invalidateOrganizations();
            },
        }),
        [qc, orgId],
    );
}

/** The trailing `orgId` argument, or none: an action called outside a business keeps its old call. */
export function asOrg(orgId: string | undefined): [] | [string] {
    return orgId ? [orgId] : [];
}

/**
 * The server's half of a save already told to the queries
 * (`afterSettingsSave()`): a screen still drawn on the server (a module's
 * page behind its guard, when a module is turned on there) is drawn again;
 * a React Query route is left alone.
 */
export function useServerRefresh(): () => void {
    const router = useRouter();
    const pathname = usePathname();
    return useCallback(() => {
        if (isRqRoute(pathname)) return;
        // rq-refresh-ok: only off React Query routes (a server-drawn page whose module guard changed).
        router.refresh();
    }, [pathname, router]);
}

"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { homeKeys } from "@/lib/home/queries";
import type { DomainKey } from "@/lib/query/keys";
import { useOrgId, useOrgIdOrNull } from "@/lib/query/org";

import {
    ownPostsRead,
    socialKeys,
    socialPicksRead,
    socialPostRead,
    socialScreenRead,
} from "./queries";

/** Saroh Social's screen for the open business (DEC-259). */
export function useSocialScreen() {
    return useQuery(socialScreenRead.options(useOrgId(), {}));
}

/** The post `?post=` names, read only when it isn't in the list (`enabled`). */
export function useOpenedPost(id: string | null, enabled: boolean) {
    return useQuery({
        ...socialPostRead.options(useOrgId(), { id: id ?? "" }),
        enabled: enabled && Boolean(id),
    });
}

/** The free Share's Your posts. */
export function useOwnPosts() {
    return useQuery(ownPostsRead.options(useOrgId(), {}));
}

/** The free Share's What's worth posting. */
export function useSocialPicks() {
    return useQuery(socialPicksRead.options(useOrgId(), {}));
}

/**
 * After a post or channel change landed: Social on screen is read again
 * (resolving once it is back); Home, whose Needs you names posts, is
 * marked stale. Never throws: a read that fails is the screen's failed
 * state.
 */
export function socialSaved(
    qc: QueryClient,
    orgId: string,
    queryKey: DomainKey = socialKeys(orgId),
): Promise<void> {
    return Promise.all([
        qc.invalidateQueries({ queryKey }),
        qc.invalidateQueries({
            queryKey: homeKeys(orgId),
            refetchType: "none",
        }),
    ]).then(
        () => undefined,
        () => undefined,
    );
}

/**
 * How a Social part saves: `orgId` goes last to each write (the action
 * runs it through `writeAsOrg`, refusing a moved tab), and `saved()` once
 * it landed.
 */
export interface SocialSave {
    orgId: string;
    /** Social read again; only `queryKey` when a save changed just that. */
    saved: (queryKey?: DomainKey) => Promise<void>;
}

export function useSocialSave(): SocialSave {
    const qc = useQueryClient();
    const orgId = useOrgId();
    return useMemo(
        () => ({
            orgId,
            saved: (queryKey?: DomainKey) => socialSaved(qc, orgId, queryKey),
        }),
        [qc, orgId],
    );
}

/**
 * Create post keeps its own draft; a save there only marks Social (and
 * Home) stale, so the next visit reads it again. Nothing outside a
 * business (a test, no provider).
 */
export function useSocialStale(): () => void {
    const qc = useQueryClient();
    const orgId = useOrgIdOrNull();
    return useCallback(() => {
        if (!orgId) return;
        for (const queryKey of [socialKeys(orgId), homeKeys(orgId)]) {
            void qc.invalidateQueries({ queryKey, refetchType: "none" });
        }
    }, [qc, orgId]);
}

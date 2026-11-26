"use client";

import type { QueryClient } from "@tanstack/react-query";
import {
    QueryClientContext,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import { forbidden, notFound } from "next/navigation";
import { useCallback, useContext, useEffect, useRef } from "react";

import { homeKeys } from "@/lib/home/queries";
import { makeQueryClient, ReadFailed } from "@/lib/query/client";
import { useOrgId, useOrgIdOrNull } from "@/lib/query/org";

import type { PostCategory } from "@/lib/content/service";
import {
    allSitesRead,
    formEntriesRead,
    newSiteRead,
    postCategoriesRead,
    publishRequestRead,
    siteFormsRead,
    siteFrameRead,
    siteKeys,
    siteLinksRead,
    siteOverviewRead,
    sitePagesRead,
    sitePostsRead,
    siteReleaseRead,
    siteSettingsRead,
    sitesKeys,
    siteTrackingRead,
    siteVersionRead,
    siteVersionsRead,
} from "./queries";

/**
 * A read refused for what it asked: a site (or request) that isn't this
 * business's is the not-found page, a role that may not read it the
 * no-access page, as the server pages answered. Anything else is left to
 * the screen's own failed state.
 */
export function whenRefused(error: unknown): void {
    if (!(error instanceof ReadFailed)) return;
    if (error.status === 404) notFound();
    if (error.status === 403) forbidden();
}

/** All sites, the rail's Website. */
export function useAllSites() {
    return useQuery(allSitesRead.options(useOrgId(), {}));
}

/** New site's catalogue, suggested address and modules. */
export function useNewSite() {
    return useQuery(newSiteRead.options(useOrgId(), {}));
}

/** The site header over every tab. */
export function useSiteFrame(siteId: string) {
    return useQuery(siteFrameRead.options(useOrgId(), { siteId }));
}

export function useSiteOverview(siteId: string) {
    return useQuery(siteOverviewRead.options(useOrgId(), { siteId }));
}

export function useSitePages(siteId: string) {
    return useQuery(sitePagesRead.options(useOrgId(), { siteId }));
}

export function useSitePosts(siteId: string) {
    return useQuery(sitePostsRead.options(useOrgId(), { siteId }));
}

/** The Categories sheet's list, read only where the sheet is offered. */
export function usePostCategories(siteId: string, enabled: boolean) {
    return useQuery({
        ...postCategoriesRead.options(useOrgId(), { siteId }),
        enabled,
    });
}

export function useSiteSettings(siteId: string) {
    return useQuery(siteSettingsRead.options(useOrgId(), { siteId }));
}

export function useSiteTracking(siteId: string) {
    return useQuery(siteTrackingRead.options(useOrgId(), { siteId }));
}

/** A client for a header drawn with no React Query above it (a test): its query is off. */
let standby: QueryClient | undefined;
const standbyClient = () => (standby ??= makeQueryClient());

/**
 * The area-off header's Categories sheet (the Posts tab): the layout's
 * list until the sheet's own read lands, and a change reads it again,
 * with the site's other reads. Drawn with no React Query above it (a
 * test), the layout's list and nothing after a change.
 */
export function useHeaderCategories(
    siteId: string,
    enabled: boolean,
): {
    data: PostCategory[] | null | undefined;
    retry: () => void;
    save: SiteSave;
} {
    const provided = useContext(QueryClientContext);
    const orgId = useOrgIdOrNull();
    const cached = Boolean(provided && orgId);
    const client = provided ?? standbyClient();
    const query = useQuery(
        {
            ...postCategoriesRead.options(orgId ?? "standby", { siteId }),
            enabled: cached && enabled,
        },
        client,
    );
    const saved = useCallback(
        () =>
            provided && orgId
                ? siteSaved(provided, orgId, siteId)
                : Promise.resolve(),
        [provided, orgId, siteId],
    );
    return {
        data: query.data,
        retry: () => void query.refetch(),
        save: { orgId: orgId ?? "", saved },
    };
}

export function useSiteForms(siteId: string) {
    return useQuery(siteFormsRead.options(useOrgId(), { siteId }));
}

export function useFormEntries(siteId: string, formId: string) {
    return useQuery(formEntriesRead.options(useOrgId(), { siteId, formId }));
}

export function useSiteLinks(siteId: string) {
    return useQuery(siteLinksRead.options(useOrgId(), { siteId }));
}

export function useSiteVersions(siteId: string) {
    return useQuery(siteVersionsRead.options(useOrgId(), { siteId }));
}

export function useSiteVersion(siteId: string, publicationId: string) {
    return useQuery(
        siteVersionRead.options(useOrgId(), { siteId, publicationId }),
    );
}

export function useSiteRelease(siteId: string, releaseId: string) {
    return useQuery(siteReleaseRead.options(useOrgId(), { siteId, releaseId }));
}

export function usePublishRequestView(siteId: string, requestId: string) {
    return useQuery(
        publishRequestRead.options(useOrgId(), { siteId, requestId }),
    );
}

/**
 * After a write to a site landed (a page, an old link, a category, a
 * restore, a publish, a request answered): the site's reads on screen are
 * read again, resolving once they're back, and Home, whose Needs you names
 * the site, is marked stale. Never throws: a read that fails is the
 * screen's failed state.
 */
export function siteSaved(
    qc: QueryClient,
    orgId: string,
    siteId: string,
): Promise<void> {
    return Promise.all([
        qc.invalidateQueries({ queryKey: siteKeys(orgId, siteId) }),
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
 * How a Website screen saves (DEC-259): each write is given `orgId` last
 * (the action runs it through `writeAsOrg`), and `saved()` once it landed.
 * A container makes it and hands it down; a refused write calls nothing.
 */
export interface SiteSave {
    orgId: string;
    saved: () => Promise<void>;
}

export function useSiteSave(siteId: string): SiteSave {
    const qc = useQueryClient();
    const orgId = useOrgId();
    const saved = useCallback(
        () => siteSaved(qc, orgId, siteId),
        [qc, orgId, siteId],
    );
    return { orgId, saved };
}

/**
 * The editor changes the draft through its own writes (not on React
 * Query): leaving it marks every Website read stale, so the area opened
 * next reads the pages, posts and pending changes afresh. Nothing outside
 * a business (a test with no provider).
 */
export function useSitesStaleOnLeave(): void {
    const qc = useQueryClient();
    const orgId = useOrgIdOrNull();
    useEffect(
        () => () => {
            if (!orgId) return;
            void qc.invalidateQueries({
                queryKey: sitesKeys(orgId),
                refetchType: "none",
            });
        },
        [qc, orgId],
    );
}

/**
 * A Website tab that isn't on React Query yet (Settings) saves and
 * `router.refresh()`es, which renders the area's layout again: the header
 * it holds is then read again too. The first render is the page's own.
 */
export function useFrameFollowsRefresh(siteId: string, rendered: string) {
    const qc = useQueryClient();
    const orgId = useOrgId();
    const first = useRef(rendered);
    useEffect(() => {
        if (first.current === rendered) return;
        first.current = rendered;
        void qc.invalidateQueries({ queryKey: siteKeys(orgId, siteId) });
    }, [qc, orgId, siteId, rendered]);
}

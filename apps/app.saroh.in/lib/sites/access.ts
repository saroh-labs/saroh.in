import "server-only";

import { unstable_rethrow } from "next/navigation";

import {
    liveAiApps,
    offersAssistantWayIn,
} from "@/lib/ai-connections/mcp-address";
import { listAiConnections } from "@/lib/ai-connections/service";
import { activeCut, pausedSiteIds, postPaused } from "@/lib/billing/paused";
import { listPostCategories, listPosts } from "@/lib/content/service";
import { listForms } from "@/lib/forms/service";
import { formatList } from "@/lib/home/needs";
import { permits } from "@/lib/organizations/permits";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import type { ServerRead } from "@/lib/query/route";
import { pausedOrNull } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";
import { apiAreaOn } from "@/lib/settings/api-area-switch";
import { businessAddress } from "@/lib/sites/default-site";
import { readPublishRequest } from "@/lib/sites/publish-requests-api";
import {
    getReviewState,
    getSite,
    getSiteChanges,
    getSiteOverview,
    listPublications,
    listSiteRedirects,
    listSites,
} from "@/lib/sites/service";
import {
    readWebAddressLinks,
    RENDERER_APEX,
} from "@/lib/sites/share-links-read";
import { siteStatus } from "@/lib/sites/site-status";
import { readTestReleases } from "@/lib/sites/test-releases-api";
import { restoresAsDraft } from "@/lib/sites/website-area-switch";

import type {
    FormRow,
    SiteFrame,
    SiteLinksScreen,
    SiteOverviewScreen,
    SitePagesScreen,
    SitePostsScreen,
    SiteVersionsScreen,
} from "./queries";
import {
    postCategoriesRead,
    publishRequestRead,
    siteFormsRead,
    siteFrameRead,
    siteLinksRead,
    siteOverviewRead,
    sitePagesRead,
    sitePostsRead,
    siteVersionsRead,
} from "./queries";

/**
 * The Website area's reads on the server (DEC-259): what `/api/sites/*`
 * answer with, behind the area's gate. Each answers only what its screen
 * draws; a site that isn't this business's is a 404 (the API's).
 */

/** Who reads a site: `site:read`, as the API asks. No permissions known permits nothing. */
export async function maySiteRead(): Promise<boolean> {
    return permits(await activeOrganizationOnce(), "site:read");
}

/** The Forms tab: `site:read` and `form:read`, which not everyone who reads the site has (#385). */
export async function mayReadSiteForms(): Promise<boolean> {
    const organization = await activeOrganizationOnce();
    return (
        permits(organization, "site:read") && permits(organization, "form:read")
    );
}

/** A part that may fail on its own: null, but Next's interrupts pass. */
function softly<T>(read: Promise<T>): Promise<T | null> {
    return read.catch((error: unknown): null => {
        unstable_rethrow(error);
        return null;
    });
}

const nameOf = (site: { name: string }) => site.name.trim() || "Untitled site";

interface SiteAsk {
    siteId: string;
}

export const siteFrameServer: ServerRead<SiteAsk, SiteFrame> = {
    read: siteFrameRead,
    service: async ({ siteId }) => {
        const [site, sites, webAddress, paused] = await Promise.all([
            getSite(siteId),
            listSites().catch(() => []),
            // Where customers reach the business (DEC-069, L8).
            readWebAddressLinks(),
            // Websites a move to a lower plan paused (#800).
            pausedOrNull(),
        ]);
        if (!site) return null;
        const name = nameOf(site);
        // One web address per business (DEC-230).
        const at = businessAddress(site, webAddress, RENDERER_APEX);
        // From the list's summary when there is one, as the header always did.
        const status = siteStatus(sites.find((s) => s.id === site.id) ?? site, {
            reader: !site.can.edit,
        });
        return {
            id: site.id,
            name,
            host: at?.host ?? null,
            address: at?.host ?? `/${site.slug}`,
            liveUrl: site.currentPublication && at ? at.url : null,
            qrUrl: at?.url ?? null,
            status,
            paused: pausedSiteIds(paused).includes(site.id),
            canEdit: site.can.edit,
            // The Publish sheet (U11), for whoever may publish; a Reviewer
            // approves in the editor instead (DEC-226).
            publish: site.can.publish
                ? {
                      siteId: site.id,
                      siteName: name,
                      host: at?.host ?? null,
                      pages: site.pages,
                      neverPublished: site.currentPublicationId === null,
                      pendingSectionChanges: site.pendingSectionChanges,
                      pendingSiteChanges: site.pendingSiteChanges,
                      needsApproval: site.publishNeedsApproval === true,
                      canOverride: site.canOverride === true,
                      addressFix: webAddress
                          ? {
                                address: webAddress.address,
                                platformOrigin: webAddress.platformOrigin,
                                canChange: webAddress.canChange === true,
                            }
                          : null,
                  }
                : null,
        };
    },
};

export const siteOverviewServer: ServerRead<SiteAsk, SiteOverviewScreen> = {
    read: siteOverviewRead,
    service: async ({ siteId }) => {
        const [site, webAddress, overview] = await Promise.all([
            getSite(siteId),
            readWebAddressLinks(),
            // A failed overview costs only its own parts.
            softly(getSiteOverview(siteId)),
        ]);
        if (!site) return null;
        const at = businessAddress(site, webAddress, RENDERER_APEX);
        const home = site.pages.find((p) => p.isHome && !p.hidden);
        return {
            overview,
            status: siteStatus(site, { reader: !site.can.edit }),
            live: site.currentPublicationId !== null,
            host: at?.host ?? null,
            url: at?.url ?? null,
            canEdit: site.can.edit,
            canPublish: site.can.publish,
            pageCount: site.pages.length,
            share: home ? { page: home, business: site.name } : null,
        };
    },
};

/** The line into AI apps (release visibility U14), read softly: the apps it names, or null. */
async function aiWayIn(): Promise<string | null> {
    if (!apiAreaOn()) return null;
    const session = await requireSession();
    const offered = offersAssistantWayIn(
        await listAiConnections().catch(() => null),
        session.user.id,
    );
    return offered ? formatList(liveAiApps().map((app) => app.name)) : null;
}

export const sitePagesServer: ServerRead<SiteAsk, SitePagesScreen> = {
    read: sitePagesRead,
    service: async ({ siteId }) => {
        const [site, overview, redirects, webAddress, aiApps, changes] =
            await Promise.all([
                getSite(siteId),
                // Health and edits: the list still loads without them.
                softly(getSiteOverview(siteId)),
                listSiteRedirects(siteId).catch(() => null),
                readWebAddressLinks(),
                aiWayIn(),
                // The Status filter's source; without it, no Status.
                softly(getSiteChanges(siteId)),
            ]);
        if (!site) return null;
        return {
            siteName: site.name,
            pages: site.pages,
            host:
                businessAddress(site, webAddress, RENDERER_APEX)?.host ?? null,
            live: site.currentPublicationId !== null,
            siteImageUrl: site.socialImageUrl ?? null,
            canUpdate: site.can.manageSettings,
            addableKinds: site.addablePageKinds,
            health: overview?.needsDoing ?? null,
            edits: overview?.pageEdits ?? null,
            lastPublishedAt: overview?.lastPublished?.at ?? null,
            redirects,
            changes: changes?.units ?? null,
            aiApps,
        };
    },
};

export const sitePostsServer: ServerRead<SiteAsk, SitePostsScreen> = {
    read: sitePostsRead,
    service: async ({ siteId }) => {
        const [site, posts, paused] = await Promise.all([
            getSite(siteId),
            listPosts(siteId),
            // Past the plan's blog posts limit (#800): marked, and why.
            pausedOrNull(),
        ]);
        if (!site) return null;
        const cut = activeCut(paused, "posts");
        return {
            canEdit: site.can.edit,
            prefix: site.postsPrefix ?? "blog",
            // The row's fields, copied one by one: nothing else crosses.
            posts: posts.map((p) => ({
                id: p.id,
                title: p.title,
                slug: p.slug,
                status: p.status,
                live: p.live,
                featured: p.featured,
                category: p.category ? { name: p.category.name } : null,
                author: p.author,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt,
                paused: postPaused(p, cut),
            })),
        };
    },
};

export const postCategoriesServer: ServerRead<
    SiteAsk,
    Awaited<ReturnType<typeof listPostCategories>>
> = {
    read: postCategoriesRead,
    service: ({ siteId }) => listPostCategories(siteId),
};

export const siteFormsServer: ServerRead<SiteAsk, FormRow[]> = {
    read: siteFormsRead,
    service: async ({ siteId }) =>
        (await listForms())
            .filter((f) => f.siteId === siteId)
            .map((f) => ({
                id: f.id,
                name: f.name,
                status: f.status,
                submissionCount: f.submissionCount,
                lastSubmissionAt: f.lastSubmissionAt,
                fields: f.fields.map((x) => ({ label: x.label })),
            })),
};

export const siteLinksServer: ServerRead<SiteAsk, SiteLinksScreen> = {
    read: siteLinksRead,
    service: async ({ siteId }) => {
        const [site, redirects, webAddress] = await Promise.all([
            getSite(siteId),
            // Null: couldn't be read, which the list says, never "none yet".
            listSiteRedirects(siteId).catch(() => null),
            readWebAddressLinks(),
        ]);
        if (!site) return null;
        return {
            name: site.name,
            host:
                businessAddress(site, webAddress, RENDERER_APEX)?.host ?? null,
            pages: site.pages,
            currentPublicationId: site.currentPublicationId ?? null,
            redirects,
            canEdit: site.can.edit,
        };
    },
};

export const siteVersionsServer: ServerRead<SiteAsk, SiteVersionsScreen> = {
    read: siteVersionsRead,
    service: async ({ siteId }) => {
        const asDraft = await restoresAsDraft();
        const [site, publications, releases, review] = await Promise.all([
            getSite(siteId),
            listPublications(siteId),
            // Never throws: `off` while test releases are off.
            readTestReleases(siteId),
            // Off, the restore confirm says a change request is outstanding (#279).
            asDraft ? null : getReviewState(siteId),
        ]);
        if (!site) return null;
        return {
            name: site.name,
            publications,
            scheduled:
                releases.state === "on"
                    ? {
                          state: "on",
                          releases: releases.list.releases,
                          zone: releases.list.zone,
                      }
                    : releases.state === "failed"
                      ? { state: "failed" }
                      : null,
            canEdit: site.can.edit,
            canPublish: site.can.publish,
            needsApproval: site.publishNeedsApproval === true,
            canOverride: site.canOverride === true,
            changesRequested: review?.outstanding ?? false,
        };
    },
};

export const publishRequestServer: ServerRead<
    { siteId: string; requestId: string },
    NonNullable<Awaited<ReturnType<typeof readPublishRequest>>>
> = {
    read: publishRequestRead,
    // Null (a 404): unknown, or another business's or site's.
    service: ({ siteId, requestId }) => readPublishRequest(siteId, requestId),
};

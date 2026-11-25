import "server-only";

import { unstable_rethrow } from "next/navigation";

import {
    lastActivityLine,
    visitsLine,
} from "@/components/sites/all-sites/site-card-words";
import {
    liveAiApps,
    offersAssistantWayIn,
} from "@/lib/ai-connections/mcp-address";
import { listAiConnections } from "@/lib/ai-connections/service";
import { activeCut, pausedSiteIds, postPaused } from "@/lib/billing/paused";
import { mayAddWebsite } from "@/lib/business-limits";
import { listPostCategories, listPosts } from "@/lib/content/service";
import { listOffersForPicker } from "@/lib/discounts/actions";
import { businessZone } from "@/lib/format/business-zone";
import { entryRows, entryWho } from "@/lib/forms/entry-rows";
import { getForm, listForms, listSubmissions } from "@/lib/forms/service";
import { formatList } from "@/lib/home/needs";
import { modulesOrUnknown } from "@/lib/modules/guard";
import { permits } from "@/lib/organizations/permits";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import {
    readOrganizationSettings,
    readSiteContact,
} from "@/lib/organizations/settings-service";
import { readReviewsForPicker } from "@/lib/product-reviews/picker-read";
import type { ServerRead } from "@/lib/query/route";
import { billingAccessOrNull, pausedOrNull } from "@/lib/saroh-billing/service";
import { readServicesForPicker } from "@/lib/services/service";
import { requireSession } from "@/lib/session";
import { apiAreaOn } from "@/lib/settings/api-area-switch";
import { readAddBusiness } from "@/lib/sites/add-business-read";
import { businessAddress, defaultSite } from "@/lib/sites/default-site";
import { readGridCatalogue } from "@/lib/sites/grid-catalogue";
import { readPublishApproval } from "@/lib/sites/publish-approval-read";
import { readPublishRequest } from "@/lib/sites/publish-requests-api";
import { readSearchTracking } from "@/lib/sites/search-tracking-read";
import type { Template } from "@/lib/sites/service";
import {
    getNewSiteDefaults,
    getPublication,
    getReviewState,
    getSite,
    getSiteChanges,
    getSiteOverview,
    listComments,
    listPublications,
    listSiteRedirects,
    listSites,
    listTemplates,
} from "@/lib/sites/service";
import { siteAddressOf } from "@/lib/sites/share-links";
import {
    readWebAddressLinks,
    RENDERER_APEX,
} from "@/lib/sites/share-links-read";
import { siteStatus } from "@/lib/sites/site-status";
import { moduleStates } from "@/lib/sites/template-picker";
import { templateChoiceOn } from "@/lib/sites/templates-switch";
import {
    readTestRelease,
    readTestReleases,
} from "@/lib/sites/test-releases-api";
import { trackersLock } from "@/lib/sites/trackers-lock";
import { restoresAsDraft } from "@/lib/sites/website-area-switch";
import { readTeamForPicker } from "@/lib/staff/team-picker-read";
import {
    listVisitedLocations,
    listVisitPlaces,
} from "@/lib/stores/storefronts";

import type {
    AllSitesScreen,
    FormEntriesScreen,
    FormRow,
    NewSiteScreen,
    PickerAnswer,
    PickerKind,
    SiteFrame,
    SiteLinksScreen,
    SiteOverviewScreen,
    SitePagesScreen,
    SitePostsScreen,
    SiteReleaseScreen,
    SiteSettingsScreen,
    SiteTrackingScreen,
    SiteVersionScreen,
    SiteVersionsScreen,
} from "./queries";
import {
    allSitesRead,
    formEntriesRead,
    newSiteRead,
    pickerRead,
    postCategoriesRead,
    publishRequestRead,
    siteFormsRead,
    siteFrameRead,
    siteLinksRead,
    siteOverviewRead,
    sitePagesRead,
    sitePostsRead,
    siteReleaseRead,
    siteSettingsRead,
    siteTrackingRead,
    siteVersionRead,
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

/** New site: `site:create`, asked of the permissions the API resolved. */
export async function mayCreateSite(): Promise<boolean> {
    return permits(await activeOrganizationOnce(), "site:create");
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

/**
 * All sites: one web address per business for now (DEC-230), so the one
 * site at the business's default address, until adding sites ships.
 */
export const allSitesServer: ServerRead<
    Record<string, never>,
    AllSitesScreen
> = {
    read: allSitesRead,
    service: async () => {
        const [sites, organization, webAddress, paused] = await Promise.all([
            listSites(),
            activeOrganizationOnce(),
            readWebAddressLinks(),
            // Websites a move to a lower plan paused (#800).
            pausedOrNull(),
        ]);
        const first = sites.at(0);
        const canAddMore = mayAddWebsite(sites.length);
        if (!first) return { sites: [], canAddMore };
        const shown = defaultSite(sites, webAddress) ?? first;
        const at = businessAddress(shown, webAddress, RENDERER_APEX);
        const zone = businessZone(organization);
        const status = siteStatus(shown, {
            reader: organization?.role === "REVIEWER",
        });
        return {
            canAddMore,
            sites: [
                {
                    id: shown.id,
                    name: nameOf(shown),
                    host: at?.host ?? null,
                    url: at?.url ?? null,
                    status: { label: status.label, tone: status.tone },
                    paused: pausedSiteIds(paused).includes(shown.id),
                    visits: visitsLine(shown.visitsLast7Days),
                    last: lastActivityLine(shown.lastActivity, zone),
                },
            ],
        };
    },
};

/**
 * New site (S2-004): with the template choice off (DEC-135) no template is
 * read. A failed catalogue is said in the form, not a failed page: the
 * site can still be made from the kind's template.
 */
export const newSiteServer: ServerRead<Record<string, never>, NewSiteScreen> = {
    read: newSiteRead,
    service: async () => {
        const [templates, defaults, modules] = await Promise.all([
            templateChoiceOn()
                ? listTemplates().catch((error: unknown): null => {
                      unstable_rethrow(error);
                      return null;
                  })
                : Promise.resolve<Template[]>([]),
            // The business's own address, or a free one like it (DEC-069, L5).
            getNewSiteDefaults(),
            modulesOrUnknown(),
        ]);
        return { templates, defaults, modules: moduleStates(modules) };
    },
};

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

export const siteSettingsServer: ServerRead<SiteAsk, SiteSettingsScreen> = {
    read: siteSettingsRead,
    service: async ({ siteId }) => {
        const [site, webAddress, contact, settings] = await Promise.all([
            getSite(siteId),
            readWebAddressLinks(),
            // What the website shows of how to reach the business (DEC-128),
            // and the business's own settings for someone who may change
            // them (owner or admin): the Contact and social rows then edit
            // in place. Anyone else reads the rows.
            readSiteContact(),
            readOrganizationSettings().catch(() => null),
        ]);
        if (!site) return null;
        const business = settings?.ok ? settings.data : null;
        // The Address sheet edits each visited location's address in place,
        // for whoever may change one; read only for someone who can open it.
        const [visited, organization, approval] = await Promise.all([
            business ? listVisitedLocations() : null,
            business ? activeOrganizationOnce().catch(() => null) : null,
            // "Publishing needs approval" (DEC-071, T13), or null.
            readPublishApproval(site),
        ]);
        return {
            site,
            // Where the site is reached, its verified domain first (L8).
            address: siteAddressOf(site, webAddress, RENDERER_APEX),
            approval,
            // The owner's, while it is rolled out (`WEB_ADDRESS_CHANGE`),
            // and only for the site at it.
            canChangeAddress:
                webAddress?.canChange === true &&
                webAddress.address === site.subdomain,
            contact,
            business,
            locations: visited?.state === "ok" ? visited.locations : null,
            canEditLocations: organization?.actions
                ? organization.actions.includes("store:write")
                : organization?.role === "OWNER" ||
                  organization?.role === "ADMIN",
        };
    },
};

/** Settings › Tracking: its own read, so the rest never waits on it. */
export const siteTrackingServer: ServerRead<SiteAsk, SiteTrackingScreen> = {
    read: siteTrackingRead,
    service: async ({ siteId }) => {
        const [read, access] = await Promise.all([
            readSearchTracking(siteId),
            billingAccessOrNull(),
        ]);
        // A failed read may be a site that isn't this business's: a 404.
        if (!read.ok && !(await getSite(siteId))) return null;
        return { read, lock: trackersLock(access) };
    },
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

/**
 * A form's entries (#385): customers' own words, so only what the page
 * draws crosses: each entry's rows as text, its contact by id and name
 * (never the email), the lead it opened. Another site's form is a 404.
 */
export const formEntriesServer: ServerRead<
    { siteId: string; formId: string },
    FormEntriesScreen
> = {
    read: formEntriesRead,
    service: async ({ siteId, formId }) => {
        const [form, page] = await Promise.all([
            getForm(formId),
            listSubmissions(formId),
        ]);
        if (form?.siteId !== siteId || !page) return null;
        return {
            name: form.name,
            active: form.status === "ACTIVE",
            total: page.total,
            entries: page.items.map((entry) => {
                const who = entryWho(entry);
                return {
                    id: entry.id,
                    createdAt: entry.createdAt,
                    contact: entry.contact
                        ? { id: entry.contact.id, name: entry.contact.name }
                        : null,
                    who,
                    leadId: entry.leadId,
                    rows: entryRows(entry, form.fields, who),
                };
            }),
        };
    },
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

/**
 * One past version (#283): drawn read-only. A section this build can no
 * longer draw is left out here rather than handed to a block that no
 * longer understands it (#194 asks for "says so", not "renders wrong").
 */
export const siteVersionServer: ServerRead<
    { siteId: string; publicationId: string },
    SiteVersionScreen
> = {
    read: siteVersionRead,
    service: async ({ siteId, publicationId }) => {
        const [site, publication] = await Promise.all([
            getSite(siteId),
            getPublication(siteId, publicationId),
        ]);
        if (!site || !publication) return null;
        const { renderable, unrenderable } = publication.renderability;
        return {
            siteName: site.name,
            publishedAt: publication.publishedAt,
            publishedBy: publication.publishedBy,
            isCurrent: site.currentPublicationId === publication.id,
            release: publication.testRelease
                ? {
                      id: publication.testRelease.id,
                      number: publication.testRelease.number,
                      name: publication.testRelease.name,
                  }
                : null,
            renderable,
            unrenderableCount: unrenderable.length,
            pages: (publication.snapshot.pages ?? []).map((page) => {
                const skipped = new Set(
                    unrenderable
                        .filter((u) => u.path === page.path)
                        .map((u) => u.index),
                );
                return {
                    path: page.path,
                    title: page.title,
                    isHome: page.isHome,
                    sections: page.sections
                        .filter((_, i) => !skipped.has(i))
                        .map((x) => ({ type: x.type, content: x.content })),
                };
            }),
            styleVariables: publication.snapshot.site?.styleVariables ?? null,
            look: publication.snapshot.site?.look ?? null,
            canEdit: site.can.edit,
            canPublish: site.can.publish,
            needsApproval: site.publishNeedsApproval === true,
            canOverride: site.canOverride === true,
        };
    },
};

/**
 * One test release (T12): 404 when it isn't this site's, or test releases
 * are off for the business (KTD-16): it is not told the feature exists.
 */
export const siteReleaseServer: ServerRead<
    { siteId: string; releaseId: string },
    SiteReleaseScreen
> = {
    read: siteReleaseRead,
    service: async ({ siteId, releaseId }) => {
        // Its notes are asked beside it; a release that isn't there is a
        // 404 whatever they answered.
        const notes = Promise.all([
            listComments(siteId, releaseId),
            getReviewState(siteId, releaseId),
        ]);
        notes.catch(() => undefined);
        const [site, detail] = await Promise.all([
            getSite(siteId),
            readTestRelease(siteId, releaseId),
        ]);
        if (!site || !detail) return null;
        const [comments, review] = await notes;
        return {
            siteName: site.name,
            release: detail.release,
            zone: detail.zone,
            pages: detail.snapshot.pages ?? [],
            unrenderable: detail.renderability.unrenderable,
            variables: detail.snapshot.site?.styleVariables ?? null,
            comments,
            review,
            sitePages: site.pages,
            canEdit: site.can.edit,
            canComment: site.can.comment,
            canApprove: site.can.approve,
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

/**
 * The editor's pickers (U33): the services, or the products and
 * collections a Product grid picks from. A refusal by the API (a role that
 * may not read them) is the picker's own "you can't see these", never an
 * empty list, and never anything the role may not read.
 */
export const pickerServer: ServerRead<{ kind: PickerKind }, PickerAnswer> = {
    read: pickerRead,
    service: async ({ kind }): Promise<PickerAnswer> => {
        switch (kind) {
            case "services":
                return readServicesForPicker();
            case "products":
                return readGridCatalogue();
            case "reviews":
                return { ok: true, reviews: await readReviewsForPicker() };
            case "add-counts":
                return { ok: true, counts: await readAddBusiness() };
            case "team":
                return { ok: true, ...(await readTeamForPicker()) };
            case "offers":
                return { ok: true, offers: await listOffersForPicker() };
            case "visit-places":
                return { ok: true, places: await listVisitPlaces() };
        }
    },
};

import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PausedNote } from "@/components/billing/paused-banner";
import { navCan } from "@/components/shared/navigation/nav-items";
import { PageContainer } from "@/components/shared/page/page-container";
import { WebsiteHeader } from "@/components/sites/header/website-header";
import { mayReadForms } from "@/components/sites/shell/group-map";
import { SiteFrame } from "@/components/sites/shell/site-frame";
import { askAiOn } from "@/lib/ask-ai/ask-ai-switch";
import { pausedSiteIds, pausedWords } from "@/lib/billing/paused";
import { listPostCategories, listPosts } from "@/lib/content/service";
import { businessZone } from "@/lib/format/business-zone";
import { listForms } from "@/lib/forms/service";
import { permits } from "@/lib/organizations/permits";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { pausedOrNull } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";
import { getSite, listSites } from "@/lib/sites/service";
import { siteAddressOf } from "@/lib/sites/share-links";
import {
    readWebAddressLinks,
    RENDERER_APEX,
} from "@/lib/sites/share-links-read";
import { siteState } from "@/lib/sites/site-state";
import { websiteAreaOn } from "@/lib/sites/website-area-switch";

/**
 * The Website screen — one header and one row of tabs over Pages, Posts and
 * Settings (or Review and Posts, for someone who reads the site).
 *
 * A layout rather than a header per page so the header, the picker and the
 * counts stay put while a tab loads: `loading.tsx` below it swaps only the
 * list. The editor, a post and the version history are not tabs — they are
 * places a tab leads to — so they live outside this group and keep their own
 * screens.
 *
 * With the Website area on (the api's switch, DEC-240), the redesigned
 * area (plan 2026-11-18-001 U3) on React Query (DEC-259): this layout
 * awaits only its gates (the session, the switch, what this person may do)
 * and `SiteFrame` reads the site header in the browser. Off, today's
 * header and tabs, unchanged and read here.
 */
/** When this render ran: what `SiteFrame` compares to see a later one. */
function renderedNow(): string {
    return String(Date.now());
}

export default async function WebsiteTabsLayout({
    params,
    children,
}: {
    params: Promise<{ siteId: string }>;
    children: ReactNode;
}) {
    const { siteId } = await params;
    await requireSession();

    if (await websiteAreaOn()) {
        const organization = await resolveActiveOrganization();
        const actor = {
            role: organization?.role ?? null,
            actions: organization?.actions,
        };
        return (
            <SiteFrame
                siteId={siteId}
                access={{
                    // The API's `site.can.edit` is `section:write`.
                    canEdit: permits(organization, "section:write"),
                    mayReadForms: mayReadForms(organization),
                    mayBusiness: navCan(actor, "org:settings:read"),
                    mayTeam: navCan(actor, "member:read"),
                }}
                mayCreate={navCan(actor, "site:create")}
                askAi={askAiOn() && organization?.role !== "REVIEWER"}
                // A later render (a tab not on React Query yet saved and
                // refreshed) reads the header again.
                rendered={renderedNow()}
            >
                {children}
            </SiteFrame>
        );
    }

    const [site, sites, organization, posts, webAddress, paused] =
        await Promise.all([
            getSite(siteId),
            listSites().catch(() => []),
            resolveActiveOrganization(),
            // A count is decoration on a tab: without it the tab still opens,
            // and the Posts tab says for itself what went wrong.
            listPosts(siteId).catch(() => null),
            // Where customers reach the business's website — its verified
            // domain, when it has one (DEC-069, L8). Null falls back to the
            // site's own subdomain.
            readWebAddressLinks(),
            // Websites a move to a lower plan paused (#800): a tag and why.
            pausedOrNull(),
        ]);
    if (!site) notFound();
    const pausedSites = pausedSiteIds(paused);

    // Forms follow `form:read`, which not everyone who can open the site has
    // (#385). The count is this site's entries; a failed read leaves the tab
    // with no count rather than taking it away.
    const formsReadable = mayReadForms(organization);
    // Asked only of someone who may read them: for anyone else the API's 403
    // would be the whole page's answer.
    const forms = formsReadable ? await listForms().catch(() => null) : null;
    const formEntries = formsReadable
        ? forms === null
            ? null
            : forms
                  .filter((f) => f.siteId === site.id)
                  .reduce((n, f) => n + f.submissionCount, 0)
        : undefined;

    // The Posts tab's "Categories" sheet, for someone who may change them.
    // A failed read is `null`, which the sheet says, never an empty list.
    const postCategories = site.can.edit
        ? await listPostCategories(siteId).catch(() => null)
        : undefined;

    // A reader is told live-and-since-when, never the owner's checks (U6).
    const stateOptions = {
        domainState: site.can.manageDomain,
        reader: site.can.edit
            ? undefined
            : { timeZone: businessZone(organization) },
    };
    const summaries = (
        sites.some((s) => s.id === site.id) ? sites : [site]
    ).map((s) => ({
        id: s.id,
        name: s.name.trim() || "Untitled site",
        state: siteState(s, stateOptions),
        paused: pausedSites.includes(s.id),
    }));
    const thisPaused = pausedSites.includes(site.id);
    const reached = siteAddressOf(site, webAddress, RENDERER_APEX);
    const mayCreate = navCan(
        { role: organization?.role ?? null, actions: organization?.actions },
        "site:create",
    );

    return (
        <PageContainer width="full">
            <div className="flex flex-col gap-6">
                <WebsiteHeader
                    site={{
                        id: site.id,
                        name: site.name.trim() || "Untitled site",
                        // From the list's summary when there is one, so the
                        // header and the picker judge the site from the same
                        // record: the detail does not carry a pending domain.
                        state: siteState(
                            sites.find((s) => s.id === site.id) ?? site,
                            // Domain state only for whoever can fix it.
                            stateOptions,
                        ),
                        paused: thisPaused,
                    }}
                    sites={summaries}
                    address={reached?.host ?? `/${site.slug}`}
                    // A link only once the site is live: before that the
                    // address opens nothing.
                    liveUrl={
                        site.currentPublication && reached ? reached.url : null
                    }
                    qrUrl={reached?.url ?? null}
                    canEdit={site.can.edit}
                    mayCreate={mayCreate}
                    pageCount={site.pages.length}
                    postCount={posts?.length ?? null}
                    formEntries={formEntries}
                    postCategories={postCategories}
                />
                {thisPaused ? (
                    <PausedNote>{pausedWords("site")}</PausedNote>
                ) : null}
                {children}
            </div>
        </PageContainer>
    );
}

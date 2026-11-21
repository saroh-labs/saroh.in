import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PausedNote } from "@/components/billing/paused-banner";
import { navCan } from "@/components/shared/navigation/nav-items";
import { PageContainer } from "@/components/shared/page/page-container";
import { WebsiteHeader } from "@/components/sites/header/website-header";
import { ChangesBar } from "@/components/sites/shell/changes-bar";
import { mayReadForms, siteGroups } from "@/components/sites/shell/group-map";
import { SiteSectionHeading } from "@/components/sites/shell/section-heading";
import {
    SitePhoneNav,
    SiteSectionList,
} from "@/components/sites/shell/section-list";
import { SiteHeader } from "@/components/sites/shell/site-header";
import { askAiOn } from "@/lib/ask-ai/ask-ai-switch";
import { pausedSiteIds, pausedWords } from "@/lib/billing/paused";
import { listPostCategories, listPosts } from "@/lib/content/service";
import { businessZone } from "@/lib/format/business-zone";
import { listForms } from "@/lib/forms/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { pausedOrNull } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";
import { businessAddress } from "@/lib/sites/default-site";
import { getSite, listSites } from "@/lib/sites/service";
import { siteAddressOf } from "@/lib/sites/share-links";
import {
    readWebAddressLinks,
    RENDERER_APEX,
} from "@/lib/sites/share-links-read";
import { siteState } from "@/lib/sites/site-state";
import { siteStatus } from "@/lib/sites/site-status";
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
 * With `NEXT_PUBLIC_WEBSITE_AREA` on, the same reads draw the redesigned
 * area instead (plan 2026-11-18-001 U3): the site header over Overview and
 * the four groups. Off, today's header and tabs, unchanged.
 */
export default async function WebsiteTabsLayout({
    params,
    children,
}: {
    params: Promise<{ siteId: string }>;
    children: ReactNode;
}) {
    const { siteId } = await params;
    await requireSession();

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
    const actor = {
        role: organization?.role ?? null,
        actions: organization?.actions,
    };
    const mayCreate = navCan(actor, "site:create");

    if (websiteAreaOn()) {
        const reader = !site.can.edit;
        // One web address per business (DEC-230): the header shows the
        // business's default, and the switcher this one site until adding
        // sites ships.
        const address = businessAddress(site, webAddress, RENDERER_APEX);
        // From the list's summary when there is one, as today's header.
        const status = siteStatus(sites.find((s) => s.id === site.id) ?? site, {
            reader,
        });
        const here = {
            id: site.id,
            name: site.name.trim() || "Untitled site",
            host: address?.host ?? null,
            status,
            paused: thisPaused,
        };
        const groups = siteGroups(site.id, {
            canEdit: site.can.edit,
            mayReadForms: formsReadable,
            mayBusiness: navCan(actor, "org:settings:read"),
            mayTeam: navCan(actor, "member:read"),
        });
        const waiting = site.can.publish ? status.waiting : 0;
        // The Publish sheet (U11), for whoever may publish; a Reviewer
        // approves in the editor instead (DEC-226).
        const publish = site.can.publish
            ? {
                  siteId: site.id,
                  siteName: here.name,
                  host: address?.host ?? null,
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
            : null;
        return (
            <PageContainer width="full">
                <div
                    className={
                        waiting > 0
                            ? "flex flex-col gap-5 max-[759px]:pb-20"
                            : "flex flex-col gap-5"
                    }
                >
                    <SiteHeader
                        site={here}
                        sites={[here]}
                        address={address?.host ?? `/${site.slug}`}
                        liveUrl={
                            site.currentPublication && address
                                ? address.url
                                : null
                        }
                        qrUrl={address?.url ?? null}
                        canEdit={site.can.edit}
                        mayCreate={mayCreate}
                        askAi={askAiOn() && organization?.role !== "REVIEWER"}
                        publish={publish}
                    />
                    {thisPaused ? (
                        <PausedNote>{pausedWords("site")}</PausedNote>
                    ) : null}
                    <div className="grid min-w-0 gap-5 min-[760px]:grid-cols-[220px_minmax(0,1fr)] min-[760px]:gap-8">
                        <SiteSectionList siteId={site.id} groups={groups} />
                        <div className="flex min-w-0 flex-col gap-5">
                            <SitePhoneNav siteId={site.id} groups={groups} />
                            <SiteSectionHeading
                                siteId={site.id}
                                groups={groups}
                                canEdit={site.can.edit}
                                postCategories={postCategories}
                            />
                            {children}
                        </div>
                    </div>
                </div>
                <ChangesBar
                    siteId={site.id}
                    waiting={waiting}
                    publish={publish}
                />
            </PageContainer>
        );
    }

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

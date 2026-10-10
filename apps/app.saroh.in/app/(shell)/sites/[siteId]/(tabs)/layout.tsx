import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PausedNote } from "@/components/billing/paused-banner";
import { navRoleCan } from "@/components/shared/nav-items";
import { PageContainer } from "@/components/shared/page-container";
import { WebsiteHeader } from "@/components/sites/website-header";
import { pausedSiteIds, pausedWords } from "@/lib/billing/paused";
import { listPosts } from "@/lib/content/service";
import { listForms } from "@/lib/forms/service";
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

/**
 * The Website screen — one header and one row of tabs over Pages, Posts and
 * Settings (or Review and Posts, for someone who reads the site).
 *
 * A layout rather than a header per page so the header, the picker and the
 * counts stay put while a tab loads: `loading.tsx` below it swaps only the
 * list. The editor, a post and the version history are not tabs — they are
 * places a tab leads to — so they live outside this group and keep their own
 * screens.
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
    const mayReadForms = organization?.actions
        ? organization.actions.includes("form:read")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";
    // Asked only of someone who may read them: for anyone else the API's 403
    // would be the whole page's answer.
    const forms = mayReadForms ? await listForms().catch(() => null) : null;
    const formEntries = mayReadForms
        ? forms === null
            ? null
            : forms
                  .filter((f) => f.siteId === site.id)
                  .reduce((n, f) => n + f.submissionCount, 0)
        : undefined;

    const summaries = (
        sites.some((s) => s.id === site.id) ? sites : [site]
    ).map((s) => ({
        id: s.id,
        name: s.name.trim() || "Untitled site",
        state: siteState(s, { domainState: site.can.manageDomain }),
        paused: pausedSites.includes(s.id),
    }));
    const thisPaused = pausedSites.includes(site.id);
    const reached = siteAddressOf(site, webAddress, RENDERER_APEX);

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
                            { domainState: site.can.manageDomain },
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
                    canEdit={site.can.edit}
                    mayCreate={navRoleCan(
                        organization?.role ?? null,
                        "site:create",
                    )}
                    pageCount={site.pages.length}
                    postCount={posts?.length ?? null}
                    formEntries={formEntries}
                />
                {thisPaused ? (
                    <PausedNote>{pausedWords("site")}</PausedNote>
                ) : null}
                {children}
            </div>
        </PageContainer>
    );
}

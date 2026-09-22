import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { navRoleCan } from "@/components/shared/nav-items";
import { PageContainer } from "@/components/shared/page-container";
import { WebsiteHeader } from "@/components/sites/website-header";
import { env } from "@/env";
import { listPosts } from "@/lib/content/service";
import { listForms } from "@/lib/forms/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { getSite, listSites } from "@/lib/sites/service";
import { siteState } from "@/lib/sites/site-state";

/**
 * Where a merchant's subdomain lives. Falls back to the production host so a
 * developer without the variable set still sees a plausible address rather than
 * "northwind.undefined" — the renderer defaults the same way.
 */
const ROOT_DOMAIN = env.NEXT_PUBLIC_ROOT_DOMAIN ?? "saroh.app";

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

    const [site, sites, organization, posts] = await Promise.all([
        getSite(siteId),
        listSites().catch(() => []),
        resolveActiveOrganization(),
        // A count is decoration on a tab: without it the tab still opens,
        // and the Posts tab says for itself what went wrong.
        listPosts(siteId).catch(() => null),
    ]);
    if (!site) notFound();

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
        state: siteState(s),
    }));

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
                        ),
                    }}
                    sites={summaries}
                    address={
                        site.subdomain
                            ? `${site.subdomain}.${ROOT_DOMAIN}`
                            : `/${site.slug}`
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
                {children}
            </div>
        </PageContainer>
    );
}

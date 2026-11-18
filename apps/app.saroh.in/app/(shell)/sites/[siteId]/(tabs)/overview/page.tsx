import { notFound, redirect } from "next/navigation";

import { navCan } from "@/components/shared/navigation/nav-items";
import { mayReadForms, siteGroups } from "@/components/sites/shell/group-map";
import { SiteHome } from "@/components/sites/shell/site-home-phone";
import { listPosts } from "@/lib/content/service";
import { count } from "@/lib/format/plural";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { businessAddress } from "@/lib/sites/default-site";
import { getSite } from "@/lib/sites/service";
import {
    readWebAddressLinks,
    RENDERER_APEX,
} from "@/lib/sites/share-links-read";
import { websiteAreaOn } from "@/lib/sites/website-area-switch";

export const metadata = { title: "Overview · Website" };

/**
 * A site's Overview (plan 2026-11-18-001). U4 draws the desk's status card,
 * results, what needs doing and activity here; until then, and always on a
 * phone, it is the site home: the four groups, each with one line of how it
 * stands. With the Website area off it forwards to the Pages tab.
 */
export default async function SiteOverviewPage({
    params,
}: {
    params: Promise<{ siteId: string }>;
}) {
    const { siteId } = await params;
    if (!websiteAreaOn()) redirect(`/sites/${siteId}/pages`);
    await requireSession();
    const [site, organization, posts, webAddress] = await Promise.all([
        getSite(siteId),
        resolveActiveOrganization(),
        // A line on a row: without it the row still opens.
        listPosts(siteId).catch(() => null),
        readWebAddressLinks(),
    ]);
    if (!site) notFound();

    const actor = {
        role: organization?.role ?? null,
        actions: organization?.actions,
    };
    const groups = siteGroups(site.id, {
        canEdit: site.can.edit,
        mayReadForms: mayReadForms(organization),
        mayBusiness: navCan(actor, "org:settings:read"),
        mayTeam: navCan(actor, "member:read"),
    });
    const pages = site.can.edit ? count(site.pages.length, "page") : null;
    const written = posts ? count(posts.length, "post") : null;
    const host = businessAddress(site, webAddress, RENDERER_APEX)?.host;

    return (
        <SiteHome
            groups={groups}
            lines={{
                "pages-and-posts":
                    [pages, written].filter(Boolean).join(" · ") || undefined,
                reach: host,
            }}
        />
    );
}

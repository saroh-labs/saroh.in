import { notFound, redirect, unstable_rethrow } from "next/navigation";

import { navCan } from "@/components/shared/navigation/nav-items";
import { Overview } from "@/components/sites/overview/overview";
import { mayReadForms, siteGroups } from "@/components/sites/shell/group-map";
import { SiteHome } from "@/components/sites/shell/site-home-phone";
import { listPosts } from "@/lib/content/service";
import { businessZone } from "@/lib/format/business-zone";
import { count } from "@/lib/format/plural";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { businessAddress } from "@/lib/sites/default-site";
import { getSite, getSiteOverview } from "@/lib/sites/service";
import {
    readWebAddressLinks,
    RENDERER_APEX,
} from "@/lib/sites/share-links-read";
import { siteStatus } from "@/lib/sites/site-status";
import { websiteAreaOn } from "@/lib/sites/website-area-switch";

export const metadata = { title: "Overview · Website" };

/**
 * A site's Overview (plan 2026-11-18-001 U4): address and status, what the
 * site brought in, what needs doing and activity. On a phone the four
 * groups follow, each with one line of how it stands (the site home). A
 * failed overview read costs only its own parts; the header and the groups
 * stay. With the Website area off it forwards to the Pages tab.
 */
export default async function SiteOverviewPage({
    params,
}: {
    params: Promise<{ siteId: string }>;
}) {
    const { siteId } = await params;
    if (!websiteAreaOn()) redirect(`/sites/${siteId}/pages`);
    await requireSession();
    const [site, organization, posts, webAddress, overview] = await Promise.all(
        [
            getSite(siteId),
            resolveActiveOrganization(),
            // A line on a row: without it the row still opens.
            listPosts(siteId).catch(() => null),
            readWebAddressLinks(),
            getSiteOverview(siteId).catch((error: unknown): null => {
                unstable_rethrow(error);
                return null;
            }),
        ],
    );
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
    const address = businessAddress(site, webAddress, RENDERER_APEX);
    const host = address?.host;

    return (
        <div className="flex min-w-0 flex-col gap-6">
            <Overview
                siteId={site.id}
                overview={overview}
                status={siteStatus(site, { reader: !site.can.edit })}
                live={site.currentPublicationId !== null}
                host={host ?? null}
                url={address?.url ?? null}
                canEdit={site.can.edit}
                canPublish={site.can.publish}
                timeZone={businessZone(organization)}
            />
            <div className="min-[760px]:hidden">
                <SiteHome
                    groups={groups}
                    lines={{
                        "pages-and-posts":
                            [pages, written].filter(Boolean).join(" · ") ||
                            undefined,
                        reach: host,
                    }}
                />
            </div>
        </div>
    );
}

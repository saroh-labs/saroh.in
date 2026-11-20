import { notFound, redirect } from "next/navigation";

import { LinksList } from "@/components/sites/reach/links-list";
import { OldLinksList } from "@/components/sites/reach/old-links-list";
import { requireSession } from "@/lib/session";
import { businessAddress } from "@/lib/sites/default-site";
import { getSite, listSiteRedirects } from "@/lib/sites/service";
import {
    readWebAddressLinks,
    RENDERER_APEX,
} from "@/lib/sites/share-links-read";
import { websiteAreaOn } from "@/lib/sites/website-area-switch";

export const metadata = { title: "Links and sharing · Website" };

/**
 * Reach › Links and sharing (plan 2026-11-18-001 U6, WXPLinks): the page
 * links the business shares, and the old links that forward to them. The
 * address is the business's one web address (DEC-230). A reader sees both
 * lists and changes nothing. With the Website area off it forwards to
 * Settings › Search and sharing, where sharing lived before.
 */
export default async function SiteLinksPage({
    params,
}: {
    params: Promise<{ siteId: string }>;
}) {
    const { siteId } = await params;
    if (!websiteAreaOn()) {
        redirect(`/sites/${siteId}/settings?section=search-and-sharing`);
    }
    await requireSession();
    const [site, redirects, webAddress] = await Promise.all([
        getSite(siteId),
        listSiteRedirects(siteId),
        readWebAddressLinks(),
    ]);
    if (!site) notFound();
    const host = businessAddress(site, webAddress, RENDERER_APEX)?.host ?? null;

    return (
        <div className="flex flex-col gap-8">
            <p className="-mt-2 text-sm text-muted-foreground">
                The links you share{host ? ` for ${host}` : ""}, and the old
                ones that still work.
            </p>
            <LinksList
                siteId={site.id}
                host={host}
                business={site.name}
                pages={site.pages}
                currentPublicationId={site.currentPublicationId ?? null}
                redirects={redirects}
            />
            <OldLinksList
                siteId={site.id}
                host={host}
                pages={site.pages}
                redirects={redirects}
                canEdit={site.can.edit}
            />
        </div>
    );
}

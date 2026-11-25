import { redirect } from "next/navigation";

import { SiteLinksContainer } from "@/components/sites/area/site-screens";
import { requireSession } from "@/lib/session";
import { websiteAreaOn } from "@/lib/sites/website-area-switch";

export const metadata = { title: "Links and sharing · Website" };

/**
 * Reach › Links and sharing (plan 2026-11-18-001 U6, WXPLinks): the page
 * links the business shares, and the old links that forward to them. The
 * address is the business's one web address (DEC-230). A reader sees both
 * lists and changes nothing. With the Website area off it forwards to
 * Settings › Search and sharing, where sharing lived before. On React
 * Query (DEC-259): read in the browser.
 */
export default async function SiteLinksPage({
    params,
}: {
    params: Promise<{ siteId: string }>;
}) {
    const { siteId } = await params;
    if (!(await websiteAreaOn())) {
        redirect(`/sites/${siteId}/settings?section=search-and-sharing`);
    }
    await requireSession();
    return <SiteLinksContainer siteId={siteId} />;
}

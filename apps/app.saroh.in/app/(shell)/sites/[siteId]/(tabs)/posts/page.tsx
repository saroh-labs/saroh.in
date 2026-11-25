import { redirect } from "next/navigation";

import { PlanLimitNotice } from "@/components/billing/plan-limit-notice";
import { SitePostsList } from "@/components/sites/posts/site-posts-list";
import { websiteAreaOn } from "@/lib/sites/website-area-switch";
import { withQuery } from "@/lib/sites/with-query";

export const metadata = { title: "Posts · Website" };

/**
 * The Posts tab. With the Website area on, its screen is Writing, and this
 * address forwards there with its query (the Categories sheet's included),
 * so old links and bookmarks still land.
 */
export default async function SitePostsPage({
    params,
    searchParams,
}: {
    params: Promise<{ siteId: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { siteId } = await params;
    if (await websiteAreaOn()) {
        redirect(withQuery(`/sites/${siteId}/writing`, await searchParams));
    }
    // The posts load in the browser (DEC-259); the plan's notice is the page's.
    return (
        <SitePostsList
            siteId={siteId}
            limitNotice={<PlanLimitNotice moduleId="blog" className="mb-4" />}
        />
    );
}

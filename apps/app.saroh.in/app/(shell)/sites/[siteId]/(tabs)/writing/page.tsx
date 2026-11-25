import { redirect } from "next/navigation";

import { PlanLimitNotice } from "@/components/billing/plan-limit-notice";
import { SitePostsList } from "@/components/sites/posts/site-posts-list";
import { websiteAreaOn } from "@/lib/sites/website-area-switch";
import { withQuery } from "@/lib/sites/with-query";

export const metadata = { title: "Blog and other writing · Website" };

/**
 * Pages and posts › Blog and other writing (plan 2026-11-18-001 U3): the
 * site's posts, as the Posts tab lists them, until kinds of writing come
 * (batch 3). With the Website area off it forwards to the Posts tab.
 */
export default async function SiteWritingPage({
    params,
    searchParams,
}: {
    params: Promise<{ siteId: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { siteId } = await params;
    if (!(await websiteAreaOn())) {
        redirect(withQuery(`/sites/${siteId}/posts`, await searchParams));
    }
    // The posts load in the browser (DEC-259); the plan's notice is the page's.
    return (
        <SitePostsList
            siteId={siteId}
            limitNotice={<PlanLimitNotice moduleId="blog" className="mb-4" />}
        />
    );
}

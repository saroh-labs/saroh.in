import { notFound, redirect } from "next/navigation";

import { PageContainer } from "@/components/shared/page-container";
import { SiteReviewView } from "@/components/sites/site-review-view";
import { requireSession } from "@/lib/session";
import {
    getPageForReview,
    getReviewState,
    getSite,
    listComments,
} from "@/lib/sites/service";

/**
 * Reading a site, for someone who may not author it (#275).
 *
 * In the SHELL, not the editor group. The editor is chrome-less on purpose —
 * it is a three-pane workspace — but a reviewer is reading and commenting, and
 * taking their navigation away to do it would strand them on one screen.
 *
 * `/sites/:siteId` redirects here for a caller without `section:write`, so the
 * link an owner shares works for whoever opens it.
 */
export const metadata = { title: "Review" };

export default async function SiteReviewPage({
    params,
    searchParams,
}: {
    params: Promise<{ siteId: string }>;
    searchParams: Promise<{ page?: string }>;
}) {
    const { siteId } = await params;
    const { page: requestedPageId } = await searchParams;
    await requireSession();

    const site = await getSite(siteId);
    if (!site) notFound();
    // Someone who can edit came to the wrong screen: send them to the editor,
    // which does everything this one does and more.
    if (site.can.edit) redirect(`/sites/${siteId}`);

    const activePage =
        site.pages.find((page) => page.id === requestedPageId) ??
        site.pages.find((page) => page.isHome) ??
        site.pages.at(0);
    if (!activePage) notFound();

    const [page, comments, review] = await Promise.all([
        getPageForReview(siteId, activePage.id),
        listComments(siteId),
        getReviewState(siteId),
    ]);

    return (
        <PageContainer>
            <SiteReviewView
                site={site}
                page={page}
                activePageId={activePage.id}
                comments={comments}
                review={review}
            />
        </PageContainer>
    );
}

import { PageSections } from "@saroh/site-blocks";

import { publicApiUrl } from "@/lib/api-url";
import type { PublicationPage, PublicationSnapshot } from "@/lib/publication";
import { getJournalFeed } from "@/lib/publication";
import { getPlansFeed } from "@/lib/site-plans";
import { getProductGridFeeds } from "@/lib/site-product-grids";

/**
 * One published page's sections, as the live site draws them: home, `[slug]`
 * and the Book and Shop pages at `/book` and `/shop` (G15), so a page is
 * drawn one way wherever its address is.
 *
 * The Journal's posts (G10), the plans on sale (G9) and each Product grid's
 * products (G12) are read only when the page draws their block.
 */
export async function PublishedPage({
    page,
    snapshot,
    siteId,
}: {
    page: PublicationPage;
    snapshot: PublicationSnapshot;
    siteId: string | null;
}) {
    const [journal, plans, productGrids] = await Promise.all([
        getJournalFeed(page.sections, snapshot, siteId),
        getPlansFeed(page.sections, snapshot, siteId),
        getProductGridFeeds(page.sections, siteId),
    ]);

    return (
        <PageSections
            sections={page.sections}
            apiUrl={publicApiUrl()}
            bookHref="/book"
            siteId={siteId}
            journal={journal}
            plans={plans}
            productGrids={productGrids}
        />
    );
}

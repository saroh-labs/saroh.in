import type { SiteNavItem } from "@saroh/site-blocks";
import { withoutEmptyInPageEntries } from "@saroh/site-blocks";

import type { PublicationSnapshot } from "@/lib/publication";
import {
    findHomePage,
    getJournalFeed,
    getPreviewJournalFeed,
} from "@/lib/publication";
import { getPacksFeed, getPreviewPacksFeed } from "@/lib/site-packs";
import { getPlansFeed, getPreviewPlansFeed } from "@/lib/site-plans";
import {
    getPreviewProductGridFeeds,
    getProductGridFeeds,
} from "@/lib/site-product-grids";

/**
 * The header's menu, less each entry to a home-page section known to draw
 * nothing now (industry templates, polish pass): a Journal with no posts,
 * Plans or Class packs with none on sale, a Product grid with no products.
 * See `withoutEmptyInPageEntries` in site-blocks.
 *
 * Asked by the layout, which draws the header on every page. The feeds are
 * read the way the home page reads them (`PublishedPage`), for the linked,
 * feed-backed home sections only, so a site without such an entry reads
 * nothing more. On the home page Next memoizes identical `fetch` GETs
 * across the layout and the page within one request, so the page's own
 * reads are not repeated.
 */
export function liveMenu(
    snapshot: PublicationSnapshot,
    siteId: string | null,
): Promise<SiteNavItem[]> {
    return withoutEmptyInPageEntries(
        snapshot.site.navigation ?? [],
        findHomePage(snapshot)?.sections ?? [],
        async (sections) => {
            const [journal, plans, packs, productGrids] = await Promise.all([
                getJournalFeed(sections, snapshot, siteId),
                getPlansFeed(sections, snapshot, siteId),
                getPacksFeed(sections, snapshot, siteId),
                getProductGridFeeds(sections, siteId),
            ]);
            return { journal, plans, packs, productGrids };
        },
    );
}

/** The same behind a preview token, over the draft's own reads. */
export function previewMenu(
    snapshot: PublicationSnapshot,
    siteId: string | null,
    token: string,
): Promise<SiteNavItem[]> {
    return withoutEmptyInPageEntries(
        snapshot.site.navigation ?? [],
        findHomePage(snapshot)?.sections ?? [],
        async (sections) => {
            const [journal, plans, packs, productGrids] = await Promise.all([
                getPreviewJournalFeed(sections, snapshot, token),
                getPreviewPlansFeed(sections, snapshot, siteId, token),
                getPreviewPacksFeed(sections, snapshot, siteId, token),
                getPreviewProductGridFeeds(sections, siteId),
            ]);
            return { journal, plans, packs, productGrids };
        },
    );
}

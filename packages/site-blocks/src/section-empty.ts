import type {
    RenderedJournal,
    RenderedProductGrid,
} from "@saroh/block-contract";
import {
    PRODUCT_GRID_DEFAULT_COUNT,
    sectionFrameOf,
} from "@saroh/block-contract";

import type { JournalFeed } from "./blocks/journal";
import { journalShowsNothing } from "./blocks/journal-posts";
import type { PacksFeed } from "./blocks/packs";
import type { PlansFeed } from "./blocks/plans";
import type { ProductGridFeed } from "./blocks/product-grid";
import type { SiteNavItem } from "./site-header-menu";

/**
 * Whether a section is known, on the server, to draw nothing.
 *
 * A block bound to the business's data can render nothing: a Journal with
 * no posts, Plans with none on sale, a Product grid with no products. The
 * feed-backed ones (Journal, Plans, Class packs, Product grid) are read by
 * the page that serves the site, so the server knows before it draws: the
 * page leaves the section's anchor off (`PageSections`), and the layout
 * leaves its entry out of the menu ({@link withoutEmptyInPageEntries}), so the
 * header never offers a jump to nothing.
 *
 * The blocks that read in the browser (Timetable, Services, Hours, Visit
 * us) are settled there instead: the header hides an entry whose section
 * turns out empty (`useShownInPageItems` in `site-header-menu.tsx`).
 *
 * Mirrors each block's own "nothing to show" rule. Answers false whenever
 * the feed is not given: then the block reads for itself, or draws its note
 * on the editor's canvas, and that is not nothing.
 */

/** The section types whose data the serving page reads (G9, G10, G12, G20). */
export const FEED_BACKED_SECTIONS = [
    "journal",
    "plans",
    "packs",
    "productGrid",
] as const;

/** The feeds a section may be drawn with, as `SectionRenderer` takes them. */
export interface SectionFeeds {
    journal?: JournalFeed;
    plans?: PlansFeed;
    packs?: PacksFeed;
    productGrid?: ProductGridFeed;
}

export function sectionRendersNothing(
    section: { type: string; content: unknown },
    feeds: SectionFeeds,
): boolean {
    switch (section.type) {
        case "journal":
            return feeds.journal
                ? journalShowsNothing(
                      section.content as RenderedJournal,
                      feeds.journal,
                  )
                : false;
        case "plans":
            return feeds.plans ? feeds.plans.plans.length === 0 : false;
        case "packs":
            return feeds.packs ? feeds.packs.packs.length === 0 : false;
        case "productGrid": {
            if (!feeds.productGrid) return false;
            const count =
                (section.content as RenderedProductGrid | null)?.count ??
                PRODUCT_GRID_DEFAULT_COUNT;
            return feeds.productGrid.products.slice(0, count).length === 0;
        }
        default:
            return false;
    }
}

interface FeedSection {
    type: string;
    content: unknown;
}

/** The feeds for some sections, as the page that draws them reads them. */
export interface FeedsFor {
    journal?: JournalFeed;
    plans?: PlansFeed;
    packs?: PacksFeed;
    /** By the section's index in the sections asked about. */
    productGrids?: readonly (ProductGridFeed | undefined)[];
}

/**
 * The menu less each home-page section entry (`/#journal`) whose section
 * is known to draw nothing.
 *
 * The menu is resolved at publish, but a Journal with no posts, Plans with
 * none on sale or a Product grid with no products is empty only now, and an
 * entry to it would land the visitor on nothing. The header is drawn by the
 * layout on every page, so the layout asks here (saroh.app
 * `lib/in-page-menu.ts`), with `read` fetching the feeds of just the linked,
 * feed-backed home sections, as the home page reads them. Nothing linked,
 * nothing read. A read that throws keeps the menu as it was: an entry is
 * never dropped on a guess.
 */
export async function withoutEmptyInPageEntries<T extends SiteNavItem>(
    navigation: readonly T[],
    homeSections: readonly FeedSection[],
    read: (sections: FeedSection[]) => Promise<FeedsFor>,
): Promise<T[]> {
    const linked = new Set(
        navigation
            .filter((item) => item.href.startsWith("/#"))
            .map((item) => item.href.slice(2)),
    );
    if (linked.size === 0) return [...navigation];
    const targets = homeSections.filter((section) => {
        const anchor = sectionFrameOf(section.content).anchor;
        return (
            anchor !== undefined &&
            linked.has(anchor) &&
            (FEED_BACKED_SECTIONS as readonly string[]).includes(section.type)
        );
    });
    if (targets.length === 0) return [...navigation];

    let feeds: FeedsFor;
    try {
        feeds = await read(targets);
    } catch {
        return [...navigation];
    }
    const empty = new Set(
        targets
            .filter((section, i) =>
                sectionRendersNothing(section, {
                    journal: feeds.journal,
                    plans: feeds.plans,
                    packs: feeds.packs,
                    productGrid: feeds.productGrids?.[i],
                }),
            )
            .map((section) => `/#${sectionFrameOf(section.content).anchor}`),
    );
    return navigation.filter((item) => !empty.has(item.href));
}

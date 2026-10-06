import type { RenderedJournal } from "@saroh/block-contract";
import { resolveVariant } from "@saroh/block-contract";

import type { JournalFeed } from "./journal";

/**
 * Which posts the Journal lists, out of its client module so the server can
 * ask it too (`section-empty.ts`): a "use client" module's exports reach a
 * server component as references, not as functions it can call.
 */

/** How many posts the block shows when the count is not set. */
export const JOURNAL_DEFAULT_COUNT = 3;

/** The posts the cards and archive looks list, from the feed. */
export function journalCardPosts(
    content: RenderedJournal,
    feed: JournalFeed,
): JournalFeed["posts"] {
    // The archive look (U2): every post, dated, whatever the count says.
    const archive = resolveVariant("journal", content) === "archive";
    // Under a lead section, the newest is already on the page (polish).
    const pool = content.afterLead ? feed.posts.slice(1) : feed.posts;
    const limit = archive ? content.archiveLimit : undefined;
    return archive
        ? limit
            ? pool.slice(0, limit)
            : pool
        : pool.slice(0, content.count ?? JOURNAL_DEFAULT_COUNT);
}

/** Whether the Journal draws nothing with this feed: no post its look shows. */
export function journalShowsNothing(
    content: RenderedJournal,
    feed: JournalFeed,
): boolean {
    // The lead look draws the newest post.
    if (resolveVariant("journal", content) === "lead") {
        return feed.posts.length === 0;
    }
    return journalCardPosts(content, feed).length === 0;
}

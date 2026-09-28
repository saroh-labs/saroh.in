import type { JournalFeed, JournalPost } from "@saroh/site-blocks";

/**
 * The Journal block's posts, for a page that has one (G10).
 *
 * The block is bound to the posts the site owns (ADR-004), so the page that
 * serves the site reads them and hands them in: live, the public posts index
 * (`getPublishedPosts`); behind a preview token, the draft's posts, as the
 * preview's own index already shows them. Read on the server, so a visitor
 * gets the posts in the page rather than after it, and only for a page that
 * draws a Journal, so every other page costs nothing extra.
 *
 * Pure apart from `read`, so the rule is testable without the app's env.
 */
export function hasJournal(sections: readonly { type: string }[]): boolean {
    return sections.some((section) => section.type === "journal");
}

export async function journalFeed(
    sections: readonly { type: string }[],
    /** The posts index the cards link under: `/blog`, or the preview's. */
    basePath: string,
    read: () => Promise<JournalPost[]>,
): Promise<JournalFeed | undefined> {
    if (!hasJournal(sections)) return undefined;
    // A failed read is an empty list (the readers never throw), and an empty
    // list draws nothing: the page still serves.
    return { posts: await read(), basePath };
}

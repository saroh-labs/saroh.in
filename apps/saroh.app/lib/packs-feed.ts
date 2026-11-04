import type { PacksFeed, PublicPack } from "@saroh/site-blocks";

/**
 * The Class packs block's packs, for a page that has one (round-2 G20), as
 * the Plans block's are read (`plans-feed.ts`): on the server, only for a
 * page that draws the block, with where "Ask about this pack" goes and
 * whether Buy can be paid online now.
 *
 * Pure apart from `read`, so the rule is testable without the app's env.
 */
export function hasPacks(sections: readonly { type: string }[]): boolean {
    return sections.some((section) => section.type === "packs");
}

/** The packs on sale, and whether Buy can be paid online now. */
export interface PacksRead {
    packs: PublicPack[];
    payOnline: boolean;
    /** The business isn't taking orders on this site (#800). */
    notTakingOrders?: boolean;
    /** The read failed: not "none", so the block says so. */
    failed?: boolean;
}

export async function packsFeed(
    sections: readonly { type: string }[],
    /** The page with the site's enquiry form, or null when it has none. */
    askHref: string | null,
    read: () => Promise<PacksRead>,
): Promise<PacksFeed | undefined> {
    if (!hasPacks(sections)) return undefined;
    // Class packs off or no pack on sale is an empty list, which draws
    // nothing. A failed read is not (the reader never throws).
    const { packs, payOnline, notTakingOrders, failed } = await read();
    return {
        ...(failed ? { failed: true } : {}),
        packs,
        payOnline,
        askHref,
        ...(notTakingOrders ? { notTakingOrders: true } : {}),
    };
}

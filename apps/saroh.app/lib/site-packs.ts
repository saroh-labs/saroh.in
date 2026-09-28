import type { PacksFeed } from "@saroh/site-blocks";
import { packsOf } from "@saroh/site-blocks";

import { shopFetch } from "./catalogue";
import type { PacksRead } from "./packs-feed";
import { packsFeed } from "./packs-feed";
import { underPrefix } from "./plans-feed";
import { enquiryPagePath } from "./shop-checkout-shape";

/**
 * The business's class packs on sale (round-2 G20), server to server, never
 * cached: `GET /public/sites/:siteId/packs`. The API serves only packs on
 * sale with their published values, and 404s while Class packs is off.
 * Either way a miss is an empty list here, so the block draws nothing. The
 * call carries the signed relay, so the API's limit counts the visitor.
 */
export async function getPublicPacks(siteId: string): Promise<PacksRead> {
    const res = await shopFetch(`${encodeURIComponent(siteId)}/packs`);
    if (!res?.ok) return { packs: [], payOnline: false };
    return (
        packsOf(await res.json().catch(() => null)) ?? {
            packs: [],
            payOnline: false,
        }
    );
}

type Snapshot = Parameters<typeof enquiryPagePath>[0];

const NONE: Promise<PacksRead> = Promise.resolve({
    packs: [],
    payOnline: false,
});

/** The Class packs block's feed for a live page, or undefined without one. */
export function getPacksFeed(
    sections: readonly { type: string }[],
    snapshot: Snapshot,
    siteId: string | null,
): Promise<PacksFeed | undefined> {
    return packsFeed(sections, enquiryPagePath(snapshot), () =>
        siteId ? getPublicPacks(siteId) : NONE,
    );
}

/**
 * The same behind a preview token, the button kept inside the preview. A
 * preview never buys: it hands the block no actions.
 */
export function getPreviewPacksFeed(
    sections: readonly { type: string }[],
    snapshot: Snapshot,
    siteId: string | null,
    token: string,
): Promise<PacksFeed | undefined> {
    return packsFeed(
        sections,
        underPrefix(
            enquiryPagePath(snapshot),
            `/preview/${encodeURIComponent(token)}`,
        ),
        () => (siteId ? getPublicPacks(siteId) : NONE),
    );
}

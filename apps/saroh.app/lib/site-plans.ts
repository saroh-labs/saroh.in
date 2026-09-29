import type { PlansFeed } from "@saroh/site-blocks";
import {
    plansAutopayMethods,
    plansOf,
    plansPayOnline,
} from "@saroh/site-blocks";

import { shopFetch } from "./catalogue";
import type { PlansRead } from "./plans-feed";
import { plansFeed, underPrefix } from "./plans-feed";
import { enquiryPagePath } from "./shop-checkout-shape";

/**
 * The business's plans on sale (round-2 G9), server to server, never
 * cached: `GET /public/sites/:siteId/plans`. The API serves only plans on
 * sale with their published values, and 404s while Payments is off. Either
 * way a miss is an empty list here, so the Plans block draws nothing. The
 * read also says whether Join can be paid online now (G20); an API that
 * doesn't say is a no. The call carries the signed relay, as the shop's
 * reads do, so the API's per-visitor limit counts the visitor.
 */
export async function getPublicPlans(siteId: string): Promise<PlansRead> {
    const res = await shopFetch(`${encodeURIComponent(siteId)}/plans`);
    if (!res?.ok) return { plans: [], payOnline: false };
    const body: unknown = await res.json().catch(() => null);
    return {
        plans: plansOf(body) ?? [],
        payOnline: plansPayOnline(body),
        // D12: the join sheet's "Pay with"; none from an older API.
        autopayMethods: plansAutopayMethods(body),
    };
}

type Snapshot = Parameters<typeof enquiryPagePath>[0];

const NONE: Promise<PlansRead> = Promise.resolve({
    plans: [],
    payOnline: false,
});

/**
 * The Plans block's feed for a live page, or undefined when the page has no
 * Plans block. With no site id there are no plans, and the block draws none.
 */
export function getPlansFeed(
    sections: readonly { type: string }[],
    snapshot: Snapshot,
    siteId: string | null,
): Promise<PlansFeed | undefined> {
    return plansFeed(sections, enquiryPagePath(snapshot), () =>
        siteId ? getPublicPlans(siteId) : NONE,
    );
}

/**
 * The same behind a preview token: the plans on sale now (a draft plan never
 * shows, even here), with the button kept inside the preview. A preview
 * never joins: it hands the blocks no actions, so they ask about joining.
 */
export function getPreviewPlansFeed(
    sections: readonly { type: string }[],
    snapshot: Snapshot,
    siteId: string | null,
    token: string,
): Promise<PlansFeed | undefined> {
    return plansFeed(
        sections,
        underPrefix(
            enquiryPagePath(snapshot),
            `/preview/${encodeURIComponent(token)}`,
        ),
        () => (siteId ? getPublicPlans(siteId) : NONE),
    );
}

import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";

import type {
    InvitableOrder,
    ProductRating,
    Review,
    ReviewEmailSetup,
} from "./service";

/**
 * Product reviews' reads (DEC-259): every review with each product's
 * rating (Products' Reviews view, its tab count and the list's stars), and
 * what Invite reviews offers. Client-safe: the keys and the routes; the
 * services are paired in `access.ts`.
 */

/** Every reviews read of a business: what a reply, hide or invite invalidates. */
export const productReviewsKeys = (orgId: string): DomainKey =>
    domainKey("product-reviews", orgId);

export interface ReviewsRead {
    reviews: Review[];
    ratings: ProductRating[];
}

export const productReviewsRead = defineRead<ReviewsRead>()({
    key: (orgId) => domainKey("product-reviews", orgId, "list"),
    route: { path: "/api/product-reviews", params: {} },
    tier: "records",
});

/** Paid, shipped orders nobody was asked about, and whether email can go (D11). */
export interface ReviewInvitesRead {
    orders: InvitableOrder[];
    /** Null when it couldn't be read: the sheet offers the list as before. */
    emailSetup: ReviewEmailSetup | null;
}

export const reviewInvitesRead = defineRead<ReviewInvitesRead>()({
    key: (orgId) => domainKey("product-reviews", orgId, "invites"),
    route: { path: "/api/product-reviews/invites", params: {} },
    tier: "records",
});

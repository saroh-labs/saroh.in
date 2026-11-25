import { z } from "zod";

import type { ReachOptions } from "@/components/stores/discounts/discount-form";
import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";

import type { Discount } from "./service";

/**
 * Discount codes' reads (DEC-259): the list and one code's page. One
 * domain: a code's change shows on both. Client-safe: the keys and the
 * routes; the services are paired in `access.ts`.
 */

/** Every Discounts read of a business: what a code's save reads again. */
export const discountsKeys = (orgId: string): DomainKey =>
    domainKey("discounts", orgId);

export const discountsListRead = defineRead<Discount[]>()({
    key: (orgId) => domainKey("discounts", orgId, "list"),
    route: { path: "/api/discounts", params: {} },
    tier: "records",
});

/** What the form offers a code's reach to, and its starting currency. */
export interface DiscountReachView {
    options: ReachOptions;
    defaultCurrency: string;
}

/** One code: the code, and the form's choices (null: read only, no `discount:write`). */
export interface DiscountView {
    discount: Discount;
    reach: DiscountReachView | null;
}

export const discountRead = defineRead<DiscountView>()({
    key: (orgId, { discountId }) =>
        domainKey("discounts", orgId, "discount", discountId),
    route: {
        path: "/api/discounts/[discountId]",
        params: { discountId: z.string().regex(/^[\w-]{1,64}$/) },
    },
    tier: "records",
});

export type DiscountAsk = Parameters<typeof discountRead.options>[1];

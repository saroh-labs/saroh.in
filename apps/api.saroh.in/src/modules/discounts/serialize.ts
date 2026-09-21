import type { Prisma } from "@saroh/database";

import { toMoneyString } from "../../common/money";
import type { DiscountState } from "./discount-state";
import { discountState } from "./discount-state";
import type { DiscountKind, DiscountReach } from "./redeem";

/** The rows a reader is told about: what the code reaches, by name. */
export interface DiscountTarget {
    id: string;
    name: string;
}

export interface DiscountView {
    id: string;
    code: string;
    description: string | null;
    kind: DiscountKind;
    /** "15", "12.5" — a percentage, when `kind` is PERCENTAGE. */
    percent: string | null;
    /** "10.00", when `kind` is FIXED_AMOUNT. */
    amount: string | null;
    currency: string | null;
    appliesTo: DiscountReach;
    targets: DiscountTarget[];
    startsAt: string | null;
    endsAt: string | null;
    usageLimit: number | null;
    /** Every redemption, counted — what the cap has spent. */
    used: number;
    state: DiscountState;
}

export const DISCOUNT_INCLUDE = {
    stores: { select: { store: { select: { id: true, name: true } } } },
    categories: {
        select: { category: { select: { id: true, name: true } } },
    },
    products: { select: { product: { select: { id: true, name: true } } } },
    _count: { select: { redemptions: true } },
} satisfies Prisma.DiscountInclude;

type DiscountRow = Prisma.DiscountGetPayload<{
    include: typeof DISCOUNT_INCLUDE;
}>;

/** 1250 → "12.5"; 1500 → "15". */
export function bpsToPercent(bps: number): string {
    return (bps / 100).toFixed(2).replace(/\.?0+$/, "");
}

export function serializeDiscount(row: DiscountRow, now: Date): DiscountView {
    const used = row._count.redemptions;
    const appliesTo = row.appliesTo as DiscountReach;
    const targets =
        appliesTo === "STOREFRONT"
            ? row.stores.map((s) => s.store)
            : appliesTo === "COLLECTION"
              ? row.categories.map((c) => c.category)
              : appliesTo === "PRODUCT"
                ? row.products.map((p) => p.product)
                : [];
    return {
        id: row.id,
        code: row.code,
        description: row.description,
        kind: row.kind as DiscountKind,
        percent: row.percentBps === null ? null : bpsToPercent(row.percentBps),
        amount: row.amount === null ? null : toMoneyString(row.amount),
        currency: row.currency,
        appliesTo,
        targets,
        startsAt: row.startsAt?.toISOString() ?? null,
        endsAt: row.endsAt?.toISOString() ?? null,
        usageLimit: row.usageLimit,
        used,
        state: discountState(row, used, now),
    };
}

import type { prisma } from "@saroh/database";

import { LATE_STATUSES, lateOf } from "../orders/fulfilment";
import {
    lateThresholdsByStore,
    thresholdsFor,
} from "../orders/late-thresholds";
import type { ItemFlag } from "./month";

/**
 * An order's flags on the calendar (plan 005 E20): cancelled, or late by
 * its own storefront's thresholds — the rule every order read uses
 * (DEC-045, `lateOf`), so a Late tag here is a Late tag on the Orders list.
 */

type Db = Pick<typeof prisma, "storeSettings">;

export interface FlaggedOrder {
    storeId: string;
    status: string;
    stage: string;
    fulfilment: string;
    paymentStatus: string;
    createdAt: Date;
}

/**
 * A function giving each order its flags. Only an open order can be late,
 * so only open orders' storefronts' thresholds are read.
 */
export async function orderFlagger(
    db: Db,
    orders: FlaggedOrder[],
    now: Date,
): Promise<(order: FlaggedOrder) => ItemFlag[]> {
    const open = (o: FlaggedOrder) =>
        (LATE_STATUSES as readonly string[]).includes(o.status);
    const thresholds = await lateThresholdsByStore(
        db,
        orders.filter(open).map((o) => o.storeId),
    );
    return (o) => {
        if (o.status === "CANCELLED") return ["cancelled"];
        if (!open(o)) return [];
        try {
            const { late } = lateOf(
                {
                    fulfilment: o.fulfilment,
                    stage: o.stage,
                    status: o.status,
                    paymentStatus: o.paymentStatus,
                    placedAt: o.createdAt,
                },
                now,
                thresholdsFor(thresholds, o.storeId),
            );
            return late ? ["late"] : [];
        } catch {
            // A way of fulfilling this release does not know: not judged,
            // rather than the whole layer lost.
            return [];
        }
    };
}

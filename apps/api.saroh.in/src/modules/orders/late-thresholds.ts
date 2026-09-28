import type { prisma } from "@saroh/database";

import type { LateThresholds, StorefrontFulfilmentType } from "./fulfilment";
import { DEFAULT_LATE_THRESHOLDS } from "./fulfilment";

/**
 * Where each storefront keeps its late thresholds (plan B, B17; default 16,
 * DEC-045): one column per physical way its orders leave, in minutes from
 * when an order was placed.
 *
 * Every reader of lateness goes through here, so the Orders list and its
 * Late filter, Order Detail, the quick view and Home judge an order by the
 * same storefront's numbers — a Late tag on one is a Late tag on all.
 */

/** The `StoreSettings` column that holds each type's threshold. */
export const LATE_THRESHOLD_COLUMNS = {
    PICKUP: "pickupLateAfterMinutes",
    LOCAL_DELIVERY: "localDeliveryLateAfterMinutes",
    SHIPPING: "shippingLateAfterMinutes",
} as const satisfies Record<StorefrontFulfilmentType, string>;

/** The fewest minutes a threshold may be: a counter's shortest wait. */
export const LATE_AFTER_MIN_MINUTES = 5;
/** The most: 30 days. */
export const LATE_AFTER_MAX_MINUTES = 30 * 24 * 60;

/** The three columns, as a Prisma `select`. */
export const LATE_THRESHOLD_SELECT = {
    pickupLateAfterMinutes: true,
    localDeliveryLateAfterMinutes: true,
    shippingLateAfterMinutes: true,
} as const;

/** A storefront's settings row, as far as the late rule reads it. */
export interface LateThresholdColumns {
    pickupLateAfterMinutes: number;
    localDeliveryLateAfterMinutes: number;
    shippingLateAfterMinutes: number;
}

/**
 * A storefront's thresholds from its settings row. A storefront that has
 * never saved settings has no row, and reads the defaults (2 h, 24 h, 48 h)
 * — the same the columns start at.
 */
export function lateThresholdsOf(
    settings: LateThresholdColumns | null | undefined,
): LateThresholds {
    if (!settings) return DEFAULT_LATE_THRESHOLDS;
    return {
        PICKUP: settings.pickupLateAfterMinutes,
        LOCAL_DELIVERY: settings.localDeliveryLateAfterMinutes,
        SHIPPING: settings.shippingLateAfterMinutes,
    };
}

type Db = Pick<typeof prisma, "storeSettings">;

/**
 * Each storefront's thresholds, read once for a page of orders however many
 * of its orders the page holds. A storefront missing from the answer reads
 * the defaults, so a caller can look any id up.
 */
export async function lateThresholdsByStore(
    db: Db,
    storeIds: readonly string[],
): Promise<ReadonlyMap<string, LateThresholds>> {
    const ids = [...new Set(storeIds)];
    if (ids.length === 0) return new Map();
    const rows = await db.storeSettings.findMany({
        where: { storeId: { in: ids } },
        select: { storeId: true, ...LATE_THRESHOLD_SELECT },
    });
    return new Map(rows.map((r) => [r.storeId, lateThresholdsOf(r)]));
}

/** One storefront's thresholds, from a map {@link lateThresholdsByStore} read. */
export function thresholdsFor(
    byStore: ReadonlyMap<string, LateThresholds>,
    storeId: string,
): LateThresholds {
    return byStore.get(storeId) ?? DEFAULT_LATE_THRESHOLDS;
}

import type { prisma } from "@saroh/database";

import type { FieldChange } from "../audit/audit-changes";
import type {
    LateThresholds,
    StorefrontFulfilmentType,
} from "../orders/fulfilment";
import {
    DEFAULT_LATE_THRESHOLDS,
    FULFILMENT_RULES,
    STOREFRONT_FULFILMENT_TYPES,
    storedValuesOf,
    storefrontTypesOf,
} from "../orders/fulfilment";
import { LATE_THRESHOLD_COLUMNS } from "../orders/late-thresholds";
import type { UpdateStorefrontDto } from "./storefronts.dto";

/**
 * How a storefront's orders leave and when they count as late (plan B,
 * B17): the chip set that replaces the collection and delivery toggles, the
 * three thresholds, and the one-time notice on Orders that tells a counter
 * the new Pick-up default.
 *
 * Pure but for the notice's read and dismissal, which take the client.
 */

/** A storefront's ways and thresholds, as the service last read them. */
export interface FulfilmentSettings {
    fulfilmentTypes: StorefrontFulfilmentType[];
    lateAfterMinutes: LateThresholds;
}

/**
 * The settings columns a save writes for the chips and the thresholds.
 *
 * Saving the chips keeps the two old toggles in step for the release the
 * app and API deploy apart (rule 3, API before app): collection is Pick-up,
 * and delivery is any way that sends the order (Local delivery or
 * Shipping), which is what the order form's "delivery" still reads.
 *
 * A Pick-up threshold off the default ends the notice by itself: it shows
 * only while the storefront is still on 2 hours ({@link lateRuleNotices}).
 */
export function fulfilmentPatch(dto: UpdateStorefrontDto): {
    fulfilmentTypes?: StorefrontFulfilmentType[];
    collectionEnabled?: boolean;
    shippingEnabled?: boolean;
    pickupLateAfterMinutes?: number;
    localDeliveryLateAfterMinutes?: number;
    shippingLateAfterMinutes?: number;
} {
    const patch: ReturnType<typeof fulfilmentPatch> = {};
    if (dto.fulfilmentTypes !== undefined) {
        const types = storefrontTypesOf(dto.fulfilmentTypes);
        patch.fulfilmentTypes = types;
        patch.collectionEnabled = types.includes("PICKUP");
        patch.shippingEnabled =
            types.includes("LOCAL_DELIVERY") || types.includes("SHIPPING");
    }
    const late = dto.lateAfterMinutes;
    if (late) {
        for (const type of STOREFRONT_FULFILMENT_TYPES) {
            const minutes = late[type];
            if (minutes !== undefined) {
                patch[LATE_THRESHOLD_COLUMNS[type]] = minutes;
            }
        }
    }
    return patch;
}

/** "2 hours", "20 minutes", "90 minutes", "1 hour": as the field shows it. */
export function lateAfterWords(minutes: number): string {
    if (minutes % 60 === 0) {
        const hours = minutes / 60;
        return `${hours} hour${hours === 1 ? "" : "s"}`;
    }
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/** "Pick-up, Shipping", or "None". */
function typesWords(types: readonly StorefrontFulfilmentType[]): string {
    return types.length
        ? types.map((t) => FULFILMENT_RULES[t].label).join(", ")
        : "None";
}

/**
 * What a save changed, for Settings › Activity: the ways, and each
 * threshold, as words. A save that left them as they were records nothing.
 */
export function fulfilmentChanges(
    before: FulfilmentSettings,
    after: FulfilmentSettings,
): FieldChange[] {
    const changes: FieldChange[] = [];
    const was = typesWords(before.fulfilmentTypes);
    const now = typesWords(after.fulfilmentTypes);
    if (was !== now) {
        changes.push({ field: "fulfilmentTypes", before: was, after: now });
    }
    for (const type of STOREFRONT_FULFILMENT_TYPES) {
        const from = before.lateAfterMinutes[type];
        const to = after.lateAfterMinutes[type];
        if (from !== to) {
            changes.push({
                field: LATE_THRESHOLD_COLUMNS[type],
                before: lateAfterWords(from),
                after: lateAfterWords(to),
            });
        }
    }
    return changes;
}

/** How far back "recent pick-up orders" looks. */
export const NOTICE_LOOKBACK_DAYS = 30;

/** A storefront the notice speaks for. */
export interface LateRuleNotice {
    storeId: string;
    name: string;
    /** The Pick-up threshold it is on: the default, 2 hours. */
    pickupLateAfterMinutes: number;
}

type Db = Pick<typeof prisma, "store">;

/**
 * The storefronts that should see the one-time notice: open, with a pick-up
 * order in the last 30 days, still on the Pick-up default, and not yet
 * dismissed. A storefront that never saved settings is on the default and
 * has dismissed nothing.
 */
export async function lateRuleNotices(
    db: Db,
    organizationId: string,
    now: Date,
): Promise<LateRuleNotice[]> {
    const since = new Date(
        now.getTime() - NOTICE_LOOKBACK_DAYS * 24 * 60 * 60_000,
    );
    const stores = await db.store.findMany({
        where: {
            organizationId,
            deletedAt: null,
            orders: {
                some: {
                    fulfilment: { in: storedValuesOf(["PICKUP"]) },
                    createdAt: { gte: since },
                },
            },
            OR: [
                { settings: null },
                {
                    settings: {
                        pickupLateAfterMinutes: DEFAULT_LATE_THRESHOLDS.PICKUP,
                        lateRuleNoticeDismissedAt: null,
                    },
                },
            ],
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true },
    });
    return stores.map((s) => ({
        storeId: s.id,
        name: s.name,
        pickupLateAfterMinutes: DEFAULT_LATE_THRESHOLDS.PICKUP,
    }));
}

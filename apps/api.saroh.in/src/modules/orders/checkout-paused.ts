import type { Prisma } from "@saroh/database";

import { keptByCut } from "../billing/over-limit";
import { overLimit } from "../billing/over-limit.service";
import { pausedByPlan } from "../billing/paused-errors";

/**
 * What a move to a lower plan does to a site's checkout (#800,
 * `billing/over-limit.ts`): a website or location past the plan's limit
 * stops taking orders (`NOT_TAKING_ORDERS`), and a product past it reads
 * as no longer sold here. Everything goes on as before when nothing is
 * paused (`PLAN_ENFORCEMENT` off, off the catalogue, or under the limits).
 * Orders already placed are never touched.
 */
export interface ShopPause {
    /** The products still on the site; spread into product reads. */
    kept: Prisma.ProductWhereInput;
    /** False: this website or its location stopped taking orders. */
    takingOrders: boolean;
}

export async function shopPause(
    organizationId: string,
    siteId: string,
    storeId: string | null,
): Promise<ShopPause> {
    const paused = await overLimit.pausedNow(organizationId);
    if (!paused) return { kept: {}, takingOrders: true };
    return {
        kept: keptByCut(paused.products),
        takingOrders:
            !paused.siteIds.has(siteId) &&
            !(storeId !== null && paused.storeIds.has(storeId)),
    };
}

/**
 * Refuse a new order taken by the team at a location the plan paused
 * (#800): it is read-only until the business moves up. Orders already
 * placed there are never touched.
 */
export async function assertLocationTakingOrders(
    organizationId: string,
    storeId: string,
): Promise<void> {
    const paused = await overLimit.pausedNow(organizationId);
    if (paused?.storeIds.has(storeId)) throw pausedByPlan("location");
}

/** Whether a website stopped taking bookings (#800): only a paused site. */
export async function siteTakingBookings(
    organizationId: string,
    siteId: string,
): Promise<boolean> {
    const paused = await overLimit.pausedNow(organizationId);
    return !paused?.siteIds.has(siteId);
}

/**
 * Whether a website takes orders for class packs and plans bought online
 * (#800): not on a paused site, which refuses them with
 * `NOT_TAKING_ORDERS` as its checkout does. The same set as bookings: a
 * paused website stops taking orders and bookings alike.
 */
export const siteTakingOrders = siteTakingBookings;

/**
 * A packs or plans read on a website that isn't taking orders (#800): the
 * packs and plans still show, Buy and Join don't (`payOnline` false), and
 * the site says it isn't taking orders. `notTakingOrders` is added only
 * then, so an older site ignores it. Pure.
 */
export function withPause<T extends { payOnline: boolean }>(
    read: T,
    taking: boolean,
): T & { notTakingOrders?: true } {
    return taking
        ? read
        : { ...read, payOnline: false, notTakingOrders: true as const };
}

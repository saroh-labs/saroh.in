import { Prisma, prisma } from "@saroh/database";

import type { FulfilmentType, OrderStage } from "./dto";
import { FULFILMENT_TYPES } from "./dto";
import { FULFILMENT_RULES, fulfilmentView, typeOf } from "./fulfilment";
import { realOrderSql } from "./open-orders";
import { STANDING_STEPS, stepKey, stepLabelOf } from "./order-list-filters";
import { orderStanding } from "./order-standing";

/**
 * What the Orders list's filter bar offers (plan B, B4), from the business's
 * own orders: the ways its orders leave, and the steps they show. "Per the
 * types present": a bakery that only does pick-up is never offered "Handed
 * to courier". Read over every real order, not the filtered list, so an
 * option doesn't vanish the moment someone picks another.
 *
 * The words come from `fulfilment.ts`, the table the rows read; the app
 * keeps no copy of it.
 */

/** One way an order leaves, as the Fulfilment filter offers it. */
export interface FulfilmentOption {
    type: FulfilmentType;
    label: string;
}

/** One word the row's pill shows, as the Step filter offers it. */
export interface StepOption {
    /** What `?step=` takes: "ready", "handed-to-courier", "refunded". */
    key: string;
    label: string;
    /** The types whose orders show it; empty for Refunded and Cancelled. */
    types: FulfilmentType[];
}

export interface OrderFilterOptions {
    types: FulfilmentOption[];
    steps: StepOption[];
    /** The product `productId` named, when it is this business's. */
    product: { id: string; name: string } | null;
}

/** A product the picker finds. */
export interface OrderProductOption {
    id: string;
    name: string;
}

/** How many products the picker lists at once. */
export const ORDER_PRODUCTS_LIMIT = 20;

interface Combination {
    fulfilment: string;
    stage: string;
    status: string;
    paymentStatus: string;
}

/**
 * Where a step sits for ordering the menu: how far along its type it is,
 * 0 (the first step) to 1 (done), so "New", "Paid" and "Booked" come
 * first and "Collected", "Delivered", "Sent" and "Attended" last.
 */
function progressOf(stored: string, stage: OrderStage): number {
    const view = fulfilmentView(stored, stage);
    return view.steps.length > 1 ? view.stepIndex / (view.steps.length - 1) : 0;
}

/**
 * The options from the combinations of fulfilment, stage, status and
 * payment the business's orders hold. Pure, so the ordering and the words
 * are pinned by a unit test.
 */
export function filterOptionsFrom(
    combos: readonly Combination[],
): Omit<OrderFilterOptions, "product"> {
    const types = new Set<FulfilmentType>();
    const steps = new Map<
        string,
        StepOption & { rank: number; typeRank: number }
    >();
    const standings = new Set<keyof typeof STANDING_STEPS>();

    for (const c of combos) {
        const type = typeOf(c.fulfilment);
        types.add(type);
        const standing = orderStanding(c.status, c.paymentStatus);
        if (standing === "REFUNDED") {
            standings.add("refunded");
            continue;
        }
        if (standing === "CANCELLED") {
            standings.add("cancelled");
            continue;
        }
        const stage = c.stage as OrderStage;
        const label = stepLabelOf(c.fulfilment, stage);
        const key = stepKey(label);
        const rank = progressOf(c.fulfilment, stage);
        const typeRank = FULFILMENT_TYPES.indexOf(type);
        const seen = steps.get(key);
        if (seen) {
            if (!seen.types.includes(type)) seen.types.push(type);
            seen.rank = Math.min(seen.rank, rank);
            seen.typeRank = Math.min(seen.typeRank, typeRank);
        } else {
            steps.set(key, { key, label, types: [type], rank, typeRank });
        }
    }

    const ordered = [...steps.values()]
        .sort(
            (a, b) =>
                a.rank - b.rank ||
                a.typeRank - b.typeRank ||
                a.label.localeCompare(b.label),
        )
        .map(({ key, label, types: t }) => ({
            key,
            label,
            types: FULFILMENT_TYPES.filter((x) => t.includes(x)),
        }));
    for (const key of ["refunded", "cancelled"] as const) {
        if (standings.has(key)) {
            ordered.push({ key, label: STANDING_STEPS[key], types: [] });
        }
    }

    return {
        types: FULFILMENT_TYPES.filter((t) => types.has(t)).map((type) => ({
            type,
            label: FULFILMENT_RULES[type].label,
        })),
        steps: ordered,
    };
}

/** The filter bar's options for a business (`GET …/orders/filters`). */
export async function orderFilterOptions(
    organizationId: string,
    productId?: string,
): Promise<OrderFilterOptions> {
    const [combos, product] = await Promise.all([
        prisma.$queryRaw<Combination[]>`
            SELECT DISTINCT o.fulfilment::text AS fulfilment,
                o.stage::text AS stage,
                o.status::text AS status,
                o."paymentStatus"::text AS "paymentStatus"
            FROM "Order" o
            WHERE o."organizationId" = ${organizationId} AND ${realOrderSql()}`,
        productId
            ? prisma.product.findFirst({
                  where: { id: productId, organizationId },
                  select: { id: true, name: true },
              })
            : null,
    ]);
    return { ...filterOptionsFrom(combos), product };
}

/** `%`, `_` and `\` taken literally in an ILIKE pattern. */
function likeEscape(text: string): string {
    return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * The product picker's search (`GET …/orders/products`): the business's
 * products that are on at least one of its real orders, by name — a
 * product nobody has ordered would only ever filter to an empty list.
 * Names only, which the rows already show a kitchen member, so it answers
 * `order:stage` as the list does.
 */
export async function searchOrderProducts(
    organizationId: string,
    q?: string,
): Promise<{ products: OrderProductOption[] }> {
    const text = q?.trim();
    const named = text
        ? Prisma.sql`AND p.name ILIKE ${`%${likeEscape(text)}%`}`
        : Prisma.empty;
    const products = await prisma.$queryRaw<OrderProductOption[]>`
        SELECT p.id, p.name
        FROM "Product" p
        WHERE p."organizationId" = ${organizationId} ${named}
            AND EXISTS (
                SELECT 1 FROM "OrderItem" oi
                JOIN "Order" o ON o.id = oi."orderId"
                WHERE oi."productId" = p.id
                    AND o."organizationId" = ${organizationId}
                    AND ${realOrderSql()}
            )
        ORDER BY lower(p.name), p.id
        LIMIT ${ORDER_PRODUCTS_LIMIT}`;
    return { products };
}

import type { Prisma } from "@saroh/database";

import { toMinor } from "../../common/money";
import {
    ANALYTICS_RETENTION_DAYS,
    ORDER_PAID_TYPE,
    ORDER_REFUNDED_TYPE,
    validateEventProperties,
} from "./event-contract";

const DAY_MS = 24 * 60 * 60 * 1000;

/** What the two writers need of the caller's transaction. */
export type OrderEventTx = Pick<
    Prisma.TransactionClient,
    "order" | "analyticsEvent"
>;

/** The one `order.paid` an order can ever have: PAID happens once. */
export function orderPaidKey(orderId: string): string {
    return `${ORDER_PAID_TYPE}:${orderId}`;
}

/** The one `order.refunded` that takes it off again. */
export function orderRefundedKey(orderId: string): string {
    return `${ORDER_REFUNDED_TYPE}:${orderId}`;
}

/**
 * Insights' orders figure (#867): an order that has just become paid
 * writes `order.paid`, in the transaction that made it paid, whichever way
 * it was paid — online at the checkout, by pay link, at the counter,
 * recorded as paid by hand, or a treatment paid in full at booking. The
 * callers are the places `Order.paymentStatus` becomes PAID, and only
 * when it moves there (never on a same→same no-op).
 *
 * Exactly once: the `dedupeKey` is the order's, and the write is
 * `createMany … skipDuplicates` (ON CONFLICT DO NOTHING), so a second
 * write — a replayed webhook, two paths racing — is a no-op that never
 * aborts the payment's transaction the way a caught P2002 would. A
 * payment status moves to PAID once in an order's life (`order-state.ts`).
 *
 * The amount is the order's total as it was paid, in minor units; no
 * customer detail is stored, only the order's id. Returns whether a row
 * was written.
 */
export async function recordOrderPaidInTx(
    tx: OrderEventTx,
    orderId: string,
    now: Date = new Date(),
): Promise<boolean> {
    const order = await tx.order.findUnique({
        where: { id: orderId },
        select: {
            total: true,
            organizationId: true,
            store: { select: { organizationId: true } },
        },
    });
    if (!order) return false;
    // An order made before `organizationId` was stamped names its business
    // through its storefront.
    const organizationId = order.organizationId ?? order.store.organizationId;
    const properties = validateEventProperties(ORDER_PAID_TYPE, 1, {
        orderId,
        amountCents: toMinor(order.total),
    });
    const { count } = await tx.analyticsEvent.createMany({
        data: [
            {
                organizationId,
                siteId: null,
                type: ORDER_PAID_TYPE,
                schemaVersion: 1,
                properties: properties as Prisma.InputJsonValue,
                consent: "anonymous",
                visitorHash: null,
                occurredAt: now,
                receivedAt: now,
                expiresAt: new Date(
                    now.getTime() + ANALYTICS_RETENTION_DAYS * DAY_MS,
                ),
                dedupeKey: orderPaidKey(orderId),
            },
        ],
        skipDuplicates: true,
    });
    return count > 0;
}

/**
 * An order refunded in full (`paymentStatus` REFUNDED) is taken off the
 * orders figure again, so it reads net, as Sales and Home's "taken" do: a
 * fully refunded order counts nothing, a partly refunded one still counts.
 *
 * Written only against the `order.paid` this order wrote: an order paid
 * before #867 was never counted, so nothing is taken off for it (DEC-012:
 * no event is made up from current rows). It is dated at the sale it
 * reverses (`occurredAt` = the `order.paid`'s), so it lowers the day the
 * order was counted on, as a refund lowers the week of its sale in Sales;
 * `receivedAt` is now, which is what the hourly rollup looks for, so that
 * day is rolled up again. Insights subtracts it from `order.paid`.
 *
 * Once, as `order.paid` is: REFUNDED is final. Returns whether a row was
 * written.
 */
export async function recordOrderRefundedInTx(
    tx: OrderEventTx,
    orderId: string,
    now: Date = new Date(),
): Promise<boolean> {
    const order = await tx.order.findUnique({
        where: { id: orderId },
        select: {
            organizationId: true,
            store: { select: { organizationId: true } },
        },
    });
    if (!order) return false;
    const organizationId = order.organizationId ?? order.store.organizationId;
    const paid = await tx.analyticsEvent.findUnique({
        where: {
            organizationId_dedupeKey: {
                organizationId,
                dedupeKey: orderPaidKey(orderId),
            },
        },
        select: { occurredAt: true, properties: true },
    });
    if (!paid) return false;
    const counted = paid.properties as { amountCents?: unknown } | null;
    const properties = validateEventProperties(ORDER_REFUNDED_TYPE, 1, {
        orderId,
        amountCents:
            typeof counted?.amountCents === "number" ? counted.amountCents : 0,
    });
    const { count } = await tx.analyticsEvent.createMany({
        data: [
            {
                organizationId,
                siteId: null,
                type: ORDER_REFUNDED_TYPE,
                schemaVersion: 1,
                properties: properties as Prisma.InputJsonValue,
                consent: "anonymous",
                visitorHash: null,
                occurredAt: paid.occurredAt,
                receivedAt: now,
                expiresAt: new Date(
                    now.getTime() + ANALYTICS_RETENTION_DAYS * DAY_MS,
                ),
                dedupeKey: orderRefundedKey(orderId),
            },
        ],
        skipDuplicates: true,
    });
    return count > 0;
}

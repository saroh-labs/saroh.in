import type { Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { OPEN_INTENT_STATUSES } from "../payments/intent-state";

/**
 * Where an order's online payment stands, when it isn't simply paid (#122):
 * the Orders list, its quick view and Order Detail say it in words — "Payment
 * failed", "Waiting for Razorpay", "Payment not finished" — with the next
 * step, never a colour alone.
 *
 * Read from the order's newest payment intent that is open, failed or
 * succeeded (an edit's charge a later edit replaced, and a cancelled one,
 * say nothing). Only while the order still owes money and stands: a paid,
 * refunded or cancelled order has no payment to chase. A treatment's payment
 * at booking is its invoice's, and its hold has its own words, so only the
 * order's own intents count here.
 *
 * - `FAILED` — the provider said the payment didn't go through. Nothing was
 *   taken; a new pay link is the way to ask again.
 * - `WAITING` — the customer opened the provider's window less than
 *   {@link WAITING_MS} ago and the provider hasn't confirmed a payment yet.
 *   The webhook or the `payments.confirm-pending` sweep settles it.
 * - `NOT_FINISHED` — still open after that: most likely the customer closed
 *   the window. A new pay link is the way to ask again.
 */
export type OnlinePaymentState = "FAILED" | "WAITING" | "NOT_FINISHED";

export interface OnlinePaymentDto {
    state: OnlinePaymentState;
    /** The provider's stored key ("RAZORPAY"); the app names it. */
    provider: string;
    /** When it failed, or when the customer started paying. */
    since: Date;
}

/** How long an open payment reads as waiting for the provider. */
export const WAITING_MS = 30 * 60 * 1000;

/** The intent fields the state is read from. */
export interface IntentForState {
    orderId: string | null;
    status: string;
    provider: string;
    createdAt: Date;
    updatedAt: Date;
}

const OPEN: readonly string[] = OPEN_INTENT_STATUSES;

/** The state, or null when there is no online payment to speak of. */
export function onlinePaymentOf(
    latest: IntentForState | null | undefined,
    order: { status: string; owedCents: number },
    now: Date,
): OnlinePaymentDto | null {
    if (!latest || order.status === "CANCELLED" || order.owedCents <= 0) {
        return null;
    }
    if (latest.status === "FAILED") {
        return {
            state: "FAILED",
            provider: latest.provider,
            since: latest.updatedAt,
        };
    }
    if (OPEN.includes(latest.status)) {
        return {
            state:
                now.getTime() - latest.createdAt.getTime() < WAITING_MS
                    ? "WAITING"
                    : "NOT_FINISHED",
            provider: latest.provider,
            since: latest.createdAt,
        };
    }
    return null;
}

/**
 * Each order's newest intent that is open, failed or succeeded, in one
 * read for a page of orders. An order with none is absent from the map.
 */
export async function latestIntentsFor(
    db: Pick<Prisma.TransactionClient, "paymentIntent">,
    organizationId: string,
    orderIds: readonly string[],
): Promise<Map<string, IntentForState>> {
    const latest = new Map<string, IntentForState>();
    if (orderIds.length === 0) return latest;
    const rows = await db.paymentIntent.findMany({
        where: {
            organizationId,
            orderId: { in: [...orderIds] },
            status: { in: [...OPEN, "FAILED", "SUCCEEDED"] },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
            orderId: true,
            status: true,
            provider: true,
            createdAt: true,
            updatedAt: true,
        },
    });
    for (const row of rows) {
        if (row.orderId && !latest.has(row.orderId)) {
            latest.set(row.orderId, row);
        }
    }
    return latest;
}

/**
 * One order's state, for Order Detail's read. A failed read leaves it out
 * (`{}`), so the page says nothing of it rather than that nothing is wrong.
 */
export async function onlinePaymentForRead(
    db: Pick<Prisma.TransactionClient, "paymentIntent">,
    organizationId: string,
    order: { id: string; status: string; owedCents: number },
    now: Date,
    logger: Pick<Logger, "warn">,
): Promise<{ onlinePayment?: OnlinePaymentDto | null }> {
    try {
        const latest = await latestIntentsFor(db, organizationId, [order.id]);
        return {
            onlinePayment: onlinePaymentOf(latest.get(order.id), order, now),
        };
    } catch (error) {
        logger.warn(
            `An order's payment state couldn't be read: ${String(error)}`,
        );
        return {};
    }
}

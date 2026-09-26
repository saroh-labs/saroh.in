import type { Prisma } from "@saroh/database";

import { CAPTURED_NEEDS_REFUND } from "../invoices/invoice-state";

/**
 * An edit's difference charge that a later edit replaced (#508, U8). Not
 * paid, and no longer asked for: the later edit's charge — or no charge, when
 * the order went back to what was paid — is what the order is owed. There is
 * no provider cancel, so a customer still on its checkout can pay it anyway;
 * the webhook then records that money as owed back, never as paid.
 * `PaymentIntent.status` is a string, so this needs no migration.
 */
export const SUPERSEDED_INTENT = "SUPERSEDED";

/** An intent the customer can still pay. */
export const OPEN_INTENT_STATUSES = [
    "CREATED",
    "REQUIRES_PAYMENT",
    "PROCESSING",
] as const;

/** The idempotency key an edit's difference charge is made under. */
export const DIFFERENCE_KEY_PREFIX = "order-edit:";

/**
 * Mark an order's open difference charges superseded. Called under the
 * order's row lock, before the edit works out what is still to take, so a
 * charge the customer pays at this moment is either already SUCCEEDED (and
 * counted) or superseded (and owed back) — never both open and counted.
 */
export async function supersedeOpenDifferenceIntents(
    tx: Pick<Prisma.TransactionClient, "paymentIntent">,
    organizationId: string,
    orderId: string,
): Promise<number> {
    const { count } = await tx.paymentIntent.updateMany({
        where: {
            organizationId,
            orderId,
            status: { in: [...OPEN_INTENT_STATUSES] },
            idempotencyKey: { startsWith: DIFFERENCE_KEY_PREFIX },
        },
        data: { status: SUPERSEDED_INTENT },
    });
    return count;
}

/**
 * Which superseded charges a customer paid anyway and has not had back: the
 * webhook recorded the capture as needing a refund, and no refund for it is
 * pending or done.
 */
export const OWED_BACK_WHERE = {
    status: SUPERSEDED_INTENT,
    attempts: { some: { status: CAPTURED_NEEDS_REFUND } },
    refunds: { none: { status: { in: ["PENDING", "SUCCEEDED"] } } },
} satisfies Prisma.PaymentIntentWhereInput;

/** An order's payments on superseded charges, owed back to the customer. */
export function owedBackOn(
    db: Pick<Prisma.TransactionClient, "paymentIntent">,
    organizationId: string,
    orderId: string,
): Promise<{ id: string; amountCents: number }[]> {
    return db.paymentIntent.findMany({
        where: { organizationId, orderId, ...OWED_BACK_WHERE },
        orderBy: { createdAt: "asc" },
        select: { id: true, amountCents: true },
    });
}

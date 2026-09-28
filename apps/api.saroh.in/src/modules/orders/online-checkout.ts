import type { Prisma } from "@saroh/database";

/**
 * An online order before it is paid (round-2 G13; round-1 R5's pattern).
 *
 * The site's checkout starts an order PENDING, UNPAID and `placedOnline`,
 * holding nothing. Until money arrives it is an abandoned checkout, not an
 * order: Orders, its counts, Home and the customer's account leave it out
 * (B1, `open-orders.ts`), and it takes no invoice number. The payment's
 * webhook holds its units (`reserveOnPayment`) and only then makes it PAID.
 *
 * A checkout nobody paid for is closed after a day by the job below. A
 * payment that loses the last unit, or arrives after the close, closes it
 * too and is refunded automatically (DEC-032).
 */

type Tx = Prisma.TransactionClient;

/** The job that closes one abandoned checkout, a day after it started. */
export const CLOSE_ABANDONED_CHECKOUT_TYPE = "orders.close-abandoned-checkout";

/** How long a checkout stays open for its payment. */
export const CHECKOUT_OPEN_MS = 24 * 60 * 60 * 1000;

/** Unpaid checkouts one account may have open at once, business-wide. */
export const MAX_OPEN_CHECKOUTS = 3;

/**
 * Said when the cap is reached. A new checkout at a storefront closes the
 * account's older unpaid ones there, so this is only reached with
 * checkouts waiting at other storefronts, which close within a day.
 */
export const CHECKOUT_OPEN_ALREADY =
    "You have other checkouts waiting for payment. Finish one of them, or try again tomorrow.";

/** The timeline's words for each way a checkout closes. */
export const CHECKOUT_NOT_COMPLETED = "Checkout not completed";
export const CHECKOUT_REPLACED = "Replaced by a newer checkout";
export const CHECKOUT_SOLD_OUT =
    "Sold out while the customer was paying — refunded automatically";
export const CHECKOUT_PAID_LATE =
    "Paid after the checkout closed — refunded automatically";

/**
 * Close an online order that was never paid: CANCELLED, with a STATUS step
 * on its timeline and no one named (the system did it). No message is
 * sent, and nothing is released: its lines never held.
 *
 * Only a checkout still PENDING and not paid closes; anything else — paid
 * a moment ago, or closed already — is left as it is and reads false. Takes
 * the order's row lock, the first lock of every order flow.
 */
export async function closeCheckoutInTx(
    tx: Tx,
    orderId: string,
    note: string,
): Promise<boolean> {
    const rows = await tx.$queryRaw<
        {
            status: string;
            paymentStatus: string;
            placedOnline: boolean;
            organizationId: string | null;
        }[]
    >`SELECT status, "paymentStatus", "placedOnline", "organizationId"
      FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const order = rows.length > 0 ? rows[0] : null;
    if (
        !order?.placedOnline ||
        !order.organizationId ||
        order.status !== "PENDING" ||
        (order.paymentStatus !== "UNPAID" && order.paymentStatus !== "FAILED")
    ) {
        return false;
    }
    await tx.order.update({
        where: { id: orderId },
        data: { status: "CANCELLED" },
    });
    await tx.orderEvent.create({
        data: {
            organizationId: order.organizationId,
            orderId,
            kind: "STATUS",
            actorUserId: null,
            fromStatus: "PENDING",
            toStatus: "CANCELLED",
            note,
        },
    });
    return true;
}

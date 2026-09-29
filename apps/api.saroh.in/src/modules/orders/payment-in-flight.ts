import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

/*
 * Marking an order paid by hand while the customer is paying for it online
 * (#622, E9). A treatment booked on the booking page is sold as an order
 * whose visit 1 is held for the customer's own payment (the 15-minute hold,
 * E8): the booking is PENDING and its invoice — the order's — waits on the
 * provider. "Mark as paid" in that window would bill the order by hand, and
 * the payment landing a moment later would bill it again. The same goes
 * for any order with a payment going through online right now.
 *
 * Read under the order's lock (`orders.service.ts` `updateStatus`). The
 * payment that confirms a hold writes the booking and the order in one
 * transaction, taking the order's row last, so a mark-paid either sees the
 * hold still open and is refused, or waits for that payment and finds the
 * order paid already.
 */

type Tx = Prisma.TransactionClient;

/** Why an order can't be marked paid now, in the words the team reads. */
export const ORDER_PAYING_ONLINE = {
    hold: "The customer is paying for this online right now. Wait for their payment to finish, then reload the order.",
    charging:
        "A payment for this order is going through online. Wait for it to finish, then reload the order.",
} as const;

/**
 * Refuse (409) marking `orderId` paid by hand while it is being paid
 * online: a visit held for the customer's own payment, or a payment on the
 * order or its invoices still going through.
 */
export async function assertNotPayingOnlineInTx(
    tx: Pick<Tx, "booking" | "paymentIntent">,
    orderId: string,
): Promise<void> {
    const held = await tx.booking.findFirst({
        where: { orderId, status: "PENDING" },
        select: { id: true },
    });
    if (held) {
        throw new ConflictException({
            message: ORDER_PAYING_ONLINE.hold,
            details: { reason: "paying-online" },
        });
    }
    const charging = await tx.paymentIntent.findFirst({
        where: {
            status: "PROCESSING",
            OR: [{ orderId }, { invoice: { orderId } }],
        },
        select: { id: true },
    });
    if (charging) {
        throw new ConflictException({
            message: ORDER_PAYING_ONLINE.charging,
            details: { reason: "paying-online" },
        });
    }
}

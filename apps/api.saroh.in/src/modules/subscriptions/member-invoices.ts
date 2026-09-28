import type { Prisma } from "@saroh/database";

import { paymentsOn } from "../invoices/payments-on";

/**
 * A member's own overdue invoice on one plan, and whether the business can
 * take it online (round-2 A8: "Pay now" in the account's Plan tab).
 */

type Db = Pick<
    Prisma.TransactionClient,
    "invoice" | "merchantPaymentProvider" | "organizationModule"
>;

export interface OverdueInvoice {
    id: string;
    total: { toString(): string };
    currency: string;
    dueAt: Date | null;
}

/**
 * The oldest of this plan's issued invoices past its due date (`isPastDue`'s
 * rule), billed to this person, that a pay link can carry: the business's
 * own paper, not an order's and not a credit note. Null when none is.
 */
export function overdueInvoiceOf(
    db: Pick<Db, "invoice">,
    scope: { organizationId: string; contactId: string },
    subscriptionId: string,
    now: Date,
): Promise<OverdueInvoice | null> {
    return db.invoice.findFirst({
        where: {
            organizationId: scope.organizationId,
            contactId: scope.contactId,
            subscriptionId,
            status: "ISSUED",
            dueAt: { lt: now },
            orderId: null,
            kind: { not: "CREDIT_NOTE" },
        },
        orderBy: [{ dueAt: "asc" }, { id: "asc" }],
        select: { id: true, total: true, currency: true, dueAt: true },
    });
}

/** Payments is on and a provider is connected, so a pay link can be paid. */
export async function takesPaymentOnline(
    db: Pick<Db, "merchantPaymentProvider" | "organizationModule">,
    organizationId: string,
): Promise<boolean> {
    if (!(await paymentsOn(db, organizationId))) return false;
    const connected = await db.merchantPaymentProvider.count({
        where: { organizationId, status: "CONNECTED" },
    });
    return connected > 0;
}

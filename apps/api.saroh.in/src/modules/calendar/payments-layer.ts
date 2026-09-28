import type { prisma } from "@saroh/database";

import { toMoneyString } from "../../common/money";
import type { DatedItem, TakingEntry } from "./month";
import { dayOf } from "./month";

/**
 * The Payments layer (plan 005 E20, the design's clinic): a business that
 * sells no orders — a clinic takes its money through bookings' invoices —
 * sees each payment on the day it was paid. It is the paid half of the
 * Invoices layer, for a business or a viewer that has no Invoices layer:
 * the service shows one or the other, never both, so no payment is listed
 * twice.
 *
 * An order's own invoice is its order (ADR-008) and never here. The layer
 * is money, so it goes to `payment:read` alone.
 */

type Db = Pick<typeof prisma, "invoice">;

function personName(
    p: {
        firstName: string | null;
        lastName: string | null;
        email: string | null;
    } | null,
): string | null {
    if (!p) return null;
    const full = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
    if (full) return full;
    const email = p.email?.trim();
    if (email) return email;
    return null;
}

/** Payments taken this window, as items, and as the takings they are. */
export async function readPayments(
    db: Db,
    organizationId: string,
    window: { start: Date; end: Date },
    zone: string,
): Promise<{ items: DatedItem[]; takings: TakingEntry[] }> {
    const rows = await db.invoice.findMany({
        where: {
            organizationId,
            orderId: null,
            kind: { in: ["INVOICE", "SUPPLEMENTARY"] },
            status: "PAID",
            paidAt: { gte: window.start, lt: window.end },
        },
        orderBy: { paidAt: "asc" },
        select: {
            id: true,
            number: true,
            total: true,
            currency: true,
            paidAt: true,
            billToName: true,
            contact: {
                select: { firstName: true, lastName: true, email: true },
            },
            booking: {
                select: { staffId: true, service: { select: { name: true } } },
            },
        },
    });
    const items: DatedItem[] = [];
    const takings: TakingEntry[] = [];
    for (const inv of rows) {
        if (!inv.paidAt) continue;
        const date = dayOf(inv.paidAt, zone);
        const who = inv.billToName ?? personName(inv.contact);
        items.push({
            layer: "payments",
            date,
            item: {
                id: `${inv.id}:payment`,
                kind: "paid",
                // "Check-up · Asha Rao": what it paid for and who, when it
                // was a booking; else the invoice and who.
                title: inv.booking
                    ? [inv.booking.service.name, who]
                          .filter(Boolean)
                          .join(" · ")
                    : (inv.number ?? "Payment"),
                subtitle: inv.booking ? inv.number : who,
                at: inv.paidAt.toISOString(),
                amount: toMoneyString(inv.total),
                currency: inv.currency,
                link: { type: "invoice", id: inv.id },
                ...(inv.booking ? { staffId: inv.booking.staffId } : {}),
            },
        });
        takings.push({ date, currency: inv.currency, amount: inv.total });
    }
    return { items, takings };
}

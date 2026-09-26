import type { Invoice } from "./service";

/**
 * Where an invoice's connections live: the order it bills, the subscription
 * that renewed it, the pack or booking it sold, and the customer it is for.
 * Pure, so the list, the quick look and the detail link the same way.
 */

/** Customer Detail, rooted on the contact; `?tab=inv` opens their invoices. */
export function customerHref(contactId: string, invoicesTab = false): string {
    return `/customers/${encodeURIComponent(contactId)}${invoicesTab ? "?tab=inv" : ""}`;
}

export function invoiceHref(id: string): string {
    return `/billing/invoices/${encodeURIComponent(id)}`;
}

/**
 * What made it, when that has a page: an order (its invoice and the
 * corrections to it), a subscription, a class pack sold. Null for one written
 * by hand, and for a booking — the calendar has no page for one booking yet.
 */
export function sourceHref(
    i: Pick<Invoice, "source" | "order" | "subscriptionId" | "packPurchaseId">,
): string | null {
    if (i.order) return `/commerce/orders/${encodeURIComponent(i.order.id)}`;
    if (i.source === "SUBSCRIPTION" && i.subscriptionId) {
        return `/billing/subscriptions/${encodeURIComponent(i.subscriptionId)}`;
    }
    if (i.source === "PACK") return "/class-packs/purchases";
    return null;
}

/** What following the source link shows, in the Connected panel's words. */
export function sourceHint(i: Pick<Invoice, "source" | "order">): string {
    if (i.order || i.source === "ORDER") {
        return "What was ordered, the kitchen steps, refunds";
    }
    switch (i.source) {
        case "SUBSCRIPTION":
            return "Next charge, pause, change plan";
        case "PACK":
            return "Classes left and who has this pack";
        case "BOOKING":
            return "The session on the calendar";
        case "COURSE":
            return "The course and who is enrolled";
        default:
            return "";
    }
}

import { cardAttention } from "./attention";
import type { OrderRow } from "./business-service";
import type { OrderRead } from "./read";

/*
 * Printing several orders' tickets at once (plan B, B6), after the "Saroh
 * Orders Screen" design's bulk "Print tickets (N)": "Opens N kitchen
 * tickets to print, oldest first." Pure, so the bar, the page and the tests
 * share the rules.
 *
 * A ticket is what an order's own "Print kitchen ticket" prints (the type's
 * `ticketName`: a kitchen ticket, a packing slip), one to a page: the
 * customer's Needs attention that may go on paper (never a sensitive entry),
 * the order's number, who it is for and how it leaves, the lines, and the
 * total only for someone who reads the order's money.
 */

/** At most one page of the list: what a selection can hold. */
export const TICKETS_MAX = 50;

/** The selected rows that have a ticket to print. */
export function printableRows<T extends Pick<OrderRow, "ticketName">>(
    rows: readonly T[],
): T[] {
    return rows.filter((r) => r.ticketName !== null);
}

/** "Print tickets (3)" — the design's bulk button. */
export function printTicketsLabel(count: number): string {
    return `Print tickets (${count})`;
}

/** Where the tickets print: the orders by id, in a new tab. */
export function ticketsHref(ids: readonly string[]): string {
    const unique = Array.from(new Set(ids)).slice(0, TICKETS_MAX);
    return `/commerce/orders/tickets?ids=${unique.map(encodeURIComponent).join(",")}`;
}

/** The ids back off the page's address: unique, at most a page's worth. */
export function readTicketIds(
    params: Record<string, string | string[] | undefined>,
): string[] {
    const raw = Array.isArray(params.ids) ? params.ids.join(",") : params.ids;
    const ids = (raw ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id));
    return Array.from(new Set(ids)).slice(0, TICKETS_MAX);
}

/** The orders to print, oldest first: only those with a ticket. */
export function ticketOrder(orders: readonly OrderRead[]): OrderRead[] {
    return orders
        .filter((o) => o.ticketName !== null)
        .sort(
            (a, b) =>
                new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime(),
        );
}

/**
 * What the ticket's box says about the customer: the entries a printed
 * ticket may carry (never a sensitive one, B15), "Allergy: Sesame"; a line
 * saying it couldn't be checked when the API couldn't read it; nothing
 * when there is none.
 */
export function ticketAttention(attention: OrderRead["attention"]): {
    lines: string[];
    unchecked: boolean;
} {
    if (attention === undefined) return { lines: [], unchecked: false };
    if (attention === null) return { lines: [], unchecked: true };
    return {
        lines: cardAttention(attention)
            .entries.filter((e) => !e.sensitive)
            .map((e) => e.text),
        unchecked: false,
    };
}

/** "2 × Sourdough loaf, Large". */
export function ticketLine(line: {
    name: string | null;
    variantTitle?: string | null;
    quantity: number;
}): string {
    const name = line.name ?? "A product that's gone";
    return `${line.quantity} × ${name}${line.variantTitle ? `, ${line.variantTitle}` : ""}`;
}

/** Who a ticket is for: the customer, a walk-in, or a record that's gone. */
export function ticketWho(
    order: Pick<OrderRead, "customer" | "walkIn">,
): string {
    if (order.customer) {
        return order.customer.name ?? order.customer.email ?? "Customer";
    }
    if (order.walkIn) return `Walk-in · ${order.walkIn.name}`;
    return "Their record is gone";
}

/**
 * The page's heading and what it couldn't print: "3 tickets", and "1 order
 * has no ticket to print" / "1 couldn't be loaded. Print it from its order."
 */
export function ticketsSummary(counts: {
    printed: number;
    noTicket: number;
    failed: number;
}): { title: string; notes: string[] } {
    const { printed, noTicket, failed } = counts;
    const notes: string[] = [];
    if (noTicket > 0) {
        notes.push(
            noTicket === 1
                ? "1 order has no ticket to print."
                : `${noTicket} orders have no ticket to print.`,
        );
    }
    if (failed > 0) {
        notes.push(
            failed === 1
                ? "1 order couldn't be loaded. Print it from its own page."
                : `${failed} orders couldn't be loaded. Print them from their own pages.`,
        );
    }
    return {
        title: printed === 1 ? "1 ticket" : `${printed} tickets`,
        notes,
    };
}

"use client";

import type { TicketsAsk } from "@/lib/orders/queries";
import { useTickets } from "@/lib/orders/use-orders";

import { OrderTickets } from "./order-tickets";

/**
 * Print tickets on React Query (DEC-259): drawn from the tickets' query,
 * read in the browser. Nothing is drawn until they land (a print sheet has
 * no loader), and a read that fails is the page failing (`error.tsx`).
 */
export function TicketsContainer({ ask }: { ask: TicketsAsk }) {
    const read = useTickets(ask);
    const { data } = read;
    if (read.isError && !data) throw read.error;
    if (!data) return null;
    return (
        <OrderTickets
            orders={data.orders}
            noTicket={data.noTicket}
            failed={data.failed}
        />
    );
}

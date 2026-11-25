"use client";

import type { TicketsAsk } from "@/lib/orders/queries";
import { useTickets } from "@/lib/orders/use-orders";

import { OrderTickets } from "./order-tickets";

/**
 * Print tickets on React Query (DEC-259): drawn from the tickets' query,
 * read in the browser. The header and Orders are drawn at once, the
 * tickets as skeletons until they land (owner, 25 Nov); Print waits for
 * them. A read that fails is the page failing (`error.tsx`).
 */
export function TicketsContainer({ ask }: { ask: TicketsAsk }) {
    const read = useTickets(ask);
    const { data } = read;
    if (read.isError && !data) throw read.error;
    return (
        <OrderTickets
            orders={data?.orders ?? null}
            noTicket={data?.noTicket ?? 0}
            failed={data?.failed ?? 0}
        />
    );
}

"use client";

import type { TicketsAsk } from "@/lib/orders/queries";
import { useTickets } from "@/lib/orders/use-orders";

import { OrderTickets } from "./order-tickets";

/** Print tickets on React Query (DEC-259): drawn from the tickets' query. */
export function TicketsContainer({ ask }: { ask: TicketsAsk }) {
    const { data } = useTickets(ask);
    if (!data) return null;
    return (
        <OrderTickets
            orders={data.orders}
            noTicket={data.noTicket}
            failed={data.failed}
        />
    );
}

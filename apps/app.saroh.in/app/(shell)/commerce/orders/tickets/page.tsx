import { OrderTickets } from "@/components/commerce/orders/order-tickets";
import { OrderLocked } from "@/components/commerce/orders/orders-states";
import { orderLockedText, ordersAccess } from "@/lib/orders/access";
import { readOrderQuickView } from "@/lib/orders/kitchen-service";
import type { OrderRead } from "@/lib/orders/read";
import { readTicketIds, ticketOrder } from "@/lib/orders/tickets";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Print tickets" };

/**
 * Sell → Orders → Print tickets (plan B, B6): the tickets of the orders
 * picked on the list (`?ids=`), one to a page, oldest first, and the print
 * dialog opened once they have painted.
 *
 * Each order is read as the list's quick view reads it (`?view=quick`), so
 * a ticket never shows more of the customer than the row did, and one that
 * can't be read costs only its own ticket — the page says how many, and
 * the rest still print. Someone holding neither `order:read` nor
 * `order:stage` gets the locked card before anything is read.
 */
export default async function TicketsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();
    const [params, organization] = await Promise.all([
        searchParams,
        resolveActiveOrganization(),
    ]);
    if (organization && !ordersAccess(organization).open) {
        return <OrderLocked text={orderLockedText(organization)} />;
    }

    const ids = readTicketIds(params);
    const reads = await Promise.all(
        ids.map((id) =>
            readOrderQuickView(id).catch(() => ({ ok: false as const })),
        ),
    );
    const found: OrderRead[] = reads.flatMap((r) => (r.ok ? [r.order] : []));
    const orders = ticketOrder(found);

    return (
        <OrderTickets
            orders={orders}
            noTicket={found.length - orders.length}
            failed={ids.length - found.length}
        />
    );
}

import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";

import { OrderDetailContainer } from "@/components/commerce/order-detail/order-detail-container";
import { OrderLocked } from "@/components/commerce/orders/orders-states";
import { ownAccountsRoom, takesOnlinePayment } from "@/lib/billing/access";
import { hasPaymentProvider } from "@/lib/invoices/tax";
import {
    orderLockedText,
    orderPowers,
    ordersAccess,
} from "@/lib/orders/access";
import { orderServer, readOrderOnce } from "@/lib/orders/access-server";
import { orderRead } from "@/lib/orders/queries";
import { arrivalOf } from "@/lib/orders/row-menu";
import { permitsFor } from "@/lib/organizations/permits";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { recordTitle } from "@/lib/page-title";
import { refundsOnlineOrUnknown } from "@/lib/payments/refunds-online";
import { prefetchRead } from "@/lib/query/prefetch";
import { getServerQueryClient } from "@/lib/query/server-client";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";

/** "Order #1042" in the tab: its number, never who it is for or its total. */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ orderId: string }>;
}) {
    const { orderId } = await params;
    return recordTitle(
        () => readOrderOnce(orderId),
        (order) => `Order #${order.orderId}`,
        "Order",
    );
}

/**
 * Sell → Orders → one order, after the "Saroh Order Detail" design, layout
 * 1d (U14, ADR-008).
 *
 * Reads the organization-scoped order (`GET organizations/:org/orders/:id`),
 * which a Member at the counter reaches with `order:stage` and which leaves
 * money out, in the API, for anyone without a money read. `?storefront=` in
 * older links is ignored: the organization scopes the read.
 *
 * Someone holding neither `order:read` nor `order:stage` gets the design's
 * locked card before the order is read (B7), rather than the generic denial
 * its 403 would bring.
 *
 * On React Query (DEC-259): the gates and what this person may do are
 * decided here; the order's read (`/api/orders/[orderId]`: the order, its
 * allergy check, payments, review invitation and "Add an item", each failing
 * on its own, `lib/orders/access-server.ts`) is prefetched and hydrated, and
 * `OrderDetailContainer` draws the page from it.
 */
export default async function OrderPage({
    params,
    searchParams,
}: {
    params: Promise<{ orderId: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();
    const [{ orderId }, organization, query] = await Promise.all([
        params,
        resolveActiveOrganization(),
        searchParams,
    ]);
    if (organization && !ordersAccess(organization).open) {
        return <OrderLocked text={orderLockedText(organization)} />;
    }
    const client = getServerQueryClient();
    const ask = { orderId };
    const [, billing] = await Promise.all([
        organization
            ? prefetchRead(client, orderServer, organization.id, ask)
            : null,
        billingAccessOrNull(),
    ]);
    const view = organization
        ? client.getQueryData(orderRead.options(organization.id, ask).queryKey)
        : undefined;
    if (!view) notFound();
    const { order } = view;

    const may = permitsFor(organization);
    // What this person may do to it, each the power its endpoint asks (B16).
    // A payment link is offered only on a plan that takes payment online
    // (R33): elsewhere the order is paid in cash or at the counter, and no
    // link is drawn at all.
    const powers = orderPowers(organization);
    const linkable = powers.payLink && takesOnlinePayment(billing);
    // With no provider and a plan that can't connect one (DEC-091), "Connect
    // one" would lead to a key form the connect refuses (UX-017): no block.
    const connectable = ownAccountsRoom(billing);
    const [canPayOnline, refundOnline] = await Promise.all([
        // A payment link (B11) is offered only to someone who may take or
        // change orders, on an order that shows money, and only while a
        // provider can open the checkout window (DEC-054).
        linkable && order.money
            ? hasPaymentProvider().catch(() => false)
            : false,
        // Whether a refund can still go back online (DEC-120): asked only
        // of someone who may refund an order that shows money.
        powers.refund && order.money ? refundsOnlineOrUnknown() : undefined,
    ]);

    return (
        <HydrationBoundary state={dehydrate(client)}>
            <OrderDetailContainer
                ask={ask}
                can={{
                    stage: powers.stage,
                    edit: powers.edit,
                    record: powers.record,
                    payLink: linkable && (canPayOnline || connectable),
                    refund: powers.refund,
                    payOnline: canPayOnline,
                    refundOnline,
                    manageProviders: may("payment:manage"),
                    contact: may("contact:read"),
                    // A treatment's visits (B14): open one, book the next.
                    bookingRead: may("booking:read"),
                    bookingWrite: may("booking:write"),
                }}
                // From the Orders list's row menu or quick view (B5): open
                // the refund or courier panel, or print the ticket, once.
                arrival={arrivalOf(query)}
                reviews={{
                    canWrite: may("product-review:write") && may("order:read"),
                    may: {
                        connect: may("comms:manage"),
                        plans: may("billing:read"),
                    },
                }}
            />
        </HydrationBoundary>
    );
}

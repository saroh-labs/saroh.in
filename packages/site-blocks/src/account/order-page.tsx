import Link from "next/link";

import { ORDERS_HREF } from "./hrefs";
import type { TrackLookup } from "./order-track";
import { orderLead, OrderTrack, trackProblem } from "./order-track";
import { AccountCard, BackLink, buttonClasses, Tag } from "./parts";

/**
 * One order on a page of its own (DEC-142), at `/account/orders/‹ref›`, so
 * an email can link straight to it: the order's Track as the sheet draws
 * it, and the way back to Orders. The Orders tab's sheet still opens from
 * its rows.
 *
 * An order that isn't theirs, or isn't there, says so here, in the
 * account, with the way back; one that couldn't be read says that instead.
 * Neither reads as the other.
 */
export function AccountOrderPage({
    lookup,
    businessName,
    messagesHref,
    ordersTab,
}: {
    lookup: TrackLookup;
    businessName: string;
    /** The account's Messages (A13); null hides the button. */
    messagesHref: string | null;
    /** This business shows the Orders tab, so there is a list to go back to. */
    ordersTab: boolean;
}) {
    const back = ordersTab ? (
        <BackLink href={ORDERS_HREF}>Orders</BackLink>
    ) : (
        <BackLink href="/account">Home</BackLink>
    );
    if (!lookup.ok) {
        const missing = lookup.reason === "missing";
        return (
            <div className="grid gap-1.5">
                {back}
                <AccountCard
                    labelledBy="account-order"
                    title={missing ? "Order not found" : "Order"}
                    lead={
                        <span role={missing ? undefined : "status"}>
                            {trackProblem(lookup.reason)}
                        </span>
                    }
                />
            </div>
        );
    }
    const { order } = lookup;
    return (
        <div className="grid gap-1.5">
            {back}
            <AccountCard
                labelledBy="account-order"
                title={`Order #${order.number}`}
                lead={
                    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                        <Tag tone={order.state === "open" ? "accent" : "quiet"}>
                            {order.status}
                        </Tag>
                        <span>{orderLead(order)}</span>
                    </span>
                }
                actions={
                    messagesHref ? (
                        <Link
                            href={messagesHref}
                            className={buttonClasses(false)}
                        >
                            Message {businessName}
                        </Link>
                    ) : undefined
                }
            >
                <div className="mt-3">
                    <OrderTrack
                        order={order}
                        canMessage={messagesHref !== null}
                    />
                </div>
            </AccountCard>
        </div>
    );
}

"use client";

import type { LookId } from "@saroh/block-contract";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { orderHref } from "./details-model";
import { ORDERS_HREF, trackHref } from "./hrefs";
import type { AccountOrder, Block } from "./model";
import { orderLine, orderTitle } from "./model";
import {
    AccountCard,
    AccountRow,
    buttonClasses,
    smallButton,
    Tag,
    Unavailable,
} from "./parts";
import { orderStatusWords } from "./status-words";
import type { TrackLookup } from "./track-sheet";
import { TrackSheet } from "./track-sheet";

/**
 * The account's Orders tab (round-2 plan A, A7; Saroh Customer Site
 * design): every order, newest first, each with where it is — the step
 * its own fulfilment type is at, or how it ended. An order on its way has
 * Track; a finished one has Details, the same sheet with its receipt.
 *
 * The open order lives in the address (`?order=‹ref›`), so Track can be
 * linked to, and Back closes it. The site's server reads it; this draws.
 * Each order also has a page of its own (`/account/orders/‹ref›`, DEC-142),
 * which its title links to and its emails open.
 */

// Kept here for the callers that read them from the Orders tab.
export { ORDERS_HREF, trackHref };

export function AccountOrders({
    orders,
    track,
    businessName,
    shopHref,
    messagesHref,
    look,
}: {
    orders: Block<AccountOrder[]>;
    /** The order whose Track is open, or null. */
    track: TrackLookup | null;
    businessName: string;
    /** The shop, while it takes orders (G13); null hides the button. */
    shopHref: string | null;
    messagesHref: string | null;
    /** The site's look (DEC-172): its words for each order's stage. */
    look?: LookId;
}) {
    const router = useRouter();
    const shop = shopHref ? (
        <Link href={shopHref} className={buttonClasses(true)}>
            Go to the shop
        </Link>
    ) : undefined;

    return (
        <div className="grid gap-3.5">
            {orders.ok ? (
                <AccountCard
                    labelledBy="account-orders-list"
                    title="Orders"
                    sub={String(orders.value.length)}
                    lead={
                        orders.value.length === 0 ? "No orders yet." : undefined
                    }
                    actions={shop}
                >
                    {orders.value.map((order) => (
                        <OrderRow key={order.ref} order={order} look={look} />
                    ))}
                </AccountCard>
            ) : (
                <AccountCard labelledBy="account-orders-list" title="Orders">
                    <Unavailable what="Orders" />
                </AccountCard>
            )}
            <TrackSheet
                track={track}
                businessName={businessName}
                messagesHref={messagesHref}
                onClose={() => router.replace(ORDERS_HREF, { scroll: false })}
            />
        </div>
    );
}

/**
 * One order: its title, when and how much, its tag and Track. Home, as the
 * design draws it, gives only an order on its way a button (`details`
 * false); the Orders tab gives a finished one Details too.
 */
export function OrderRow({
    order,
    details = true,
    look,
}: {
    order: AccountOrder;
    details?: boolean;
    /**
     * Under a look the tag says the stage in the customer's words, one
     * mapping for every look (`status-words.ts`): a pick-up is never "on
     * its way". Classic keeps the API's word.
     */
    look?: LookId;
}) {
    const button = order.open || details;
    return (
        <AccountRow
            title={orderTitle(order)}
            // The order's own page (DEC-142); Track still opens the sheet.
            href={orderHref(order.ref)}
            sub={orderLine(order)}
            tag={
                <Tag tone={order.open ? "accent" : "quiet"}>
                    {look ? orderStatusWords(order) : order.status}
                </Tag>
            }
            actions={button ? <OrderButton order={order} /> : undefined}
        />
    );
}

function OrderButton({ order }: { order: AccountOrder }) {
    return (
        <Link
            href={trackHref(order.ref)}
            scroll={false}
            className={smallButton}
            aria-label={`${order.open ? "Track" : "Details of"} order #${order.number}`}
        >
            {order.open ? "Track" : "Details"}
        </Link>
    );
}

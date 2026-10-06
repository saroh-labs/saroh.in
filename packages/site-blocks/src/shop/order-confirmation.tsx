import Link from "next/link";
import type { ReactNode } from "react";

import { focusRing } from "../booking-flow/styles";
import { cn } from "../lib/utils";
import { formatAmount } from "../product/product-page";

/**
 * The order confirmation on a merchant's site (round-2 P4), at
 * `/shop/order/<ref>`: where the bag sheet's "Order placed" leads, on the
 * business's own domain. The order's number, what was bought, the money,
 * and how it reaches the customer — the pick-up place or the address they
 * gave — then a way back to the shop and, with the account area, to their
 * Orders.
 *
 * It says nothing about a receipt email: none is sent when a site order is
 * placed, and the page never claims one that didn't go. Drawn in the
 * site's own tokens only; a merchant's site never wears Saroh's brand.
 */

export interface OrderConfirmationLine {
    name: string;
    variant: string | null;
    quantity: number;
    amount: string;
}

/** What the API sends for a placed order (`checkout-confirmation.ts`). */
export interface OrderConfirmationData {
    orderNumber: string;
    placedAt: string;
    currency: string;
    lines: OrderConfirmationLine[];
    subtotal: string;
    delivery: string | null;
    discount: string | null;
    total: string;
    fulfilment: {
        type: string;
        label: string;
        pickup: { name: string; address: string | null } | null;
        deliverTo: { name: string | null; lines: string[] } | null;
    };
    refunded: boolean;
    /**
     * Placed to be paid at the handover and not paid yet: "Pay when you
     * collect" or "Pay on delivery". Null once paid, or paid online.
     */
    toPay: string | null;
}

/**
 * The page's read, as the site's server answers it:
 * - signed-out: no session here, or it ended — the order is shown only to
 *   whoever placed it, signed in;
 * - missing: not theirs, not placed, or no such order (one answer for all);
 * - unavailable: the API couldn't be asked.
 */
export type OrderConfirmationLookup =
    | { ok: true; order: OrderConfirmationData }
    | { ok: false; reason: "signed-out" | "missing" | "unavailable" };

const linkButton = (primary: boolean) =>
    cn(
        "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[calc(var(--site-radius)+10px)] px-5 text-sm font-bold transition-[opacity,transform] duration-100 active:scale-[0.99]",
        focusRing,
        primary
            ? "bg-site-accent text-site-accent-fg hover:opacity-90"
            : "border-site-border text-site-fg border hover:opacity-80",
    );

function Frame({ children }: { children: ReactNode }) {
    return (
        <div className="bg-site-bg mx-auto max-w-[640px] px-4 py-10 sm:px-5 sm:py-16">
            {children}
        </div>
    );
}

/** What was bought: each line, then the money. */
function Summary({ order }: { order: OrderConfirmationData }) {
    const money = (amount: string) => formatAmount(amount, order.currency);
    return (
        <section
            aria-labelledby="order-items"
            className="border-site-border bg-site-surface mt-6 rounded-[14px] border p-4 sm:p-5"
        >
            <h2
                id="order-items"
                className="font-site-heading text-site-fg text-lg font-semibold"
            >
                Your order
            </h2>
            <ul className="divide-site-border mt-2 divide-y">
                {order.lines.map((line, i) => (
                    <li
                        key={`${line.name}-${line.variant ?? ""}-${i}`}
                        className="flex items-start justify-between gap-3 py-3"
                    >
                        <span className="min-w-0">
                            <span className="text-site-fg block break-words font-medium">
                                {line.name}
                            </span>
                            <span className="text-site-muted block text-sm">
                                {line.variant ? `${line.variant} · ` : ""}
                                Qty {line.quantity}
                            </span>
                        </span>
                        <span className="text-site-fg shrink-0 tabular-nums">
                            {money(line.amount)}
                        </span>
                    </li>
                ))}
            </ul>
            <dl className="border-site-border mt-1 space-y-1.5 border-t pt-3 text-sm">
                <div className="flex justify-between gap-3">
                    <dt className="text-site-body">Subtotal</dt>
                    <dd className="text-site-fg tabular-nums">
                        {money(order.subtotal)}
                    </dd>
                </div>
                {order.discount ? (
                    <div className="flex justify-between gap-3">
                        <dt className="text-site-body">Discount</dt>
                        <dd className="text-site-fg tabular-nums">
                            −{money(order.discount)}
                        </dd>
                    </div>
                ) : null}
                {order.delivery ? (
                    <div className="flex justify-between gap-3">
                        <dt className="text-site-body">
                            {order.fulfilment.label}
                        </dt>
                        <dd className="text-site-fg tabular-nums">
                            {money(order.delivery)}
                        </dd>
                    </div>
                ) : null}
                <div className="flex justify-between gap-3 pt-1.5 text-base font-semibold">
                    <dt className="text-site-fg">
                        {order.refunded
                            ? "Paid, then refunded"
                            : order.toPay
                              ? toPayTotal(order.toPay)
                              : "Paid"}
                    </dt>
                    <dd className="text-site-fg tabular-nums">
                        {money(order.total)}
                    </dd>
                </div>
            </dl>
        </section>
    );
}

/** How it reaches them: where to collect it, or where it goes. */
function Handover({ order }: { order: OrderConfirmationData }) {
    const { pickup, deliverTo, label } = order.fulfilment;
    if (!pickup && !deliverTo) return null;
    return (
        <section
            aria-labelledby="order-handover"
            className="border-site-border bg-site-surface mt-4 rounded-[14px] border p-4 sm:p-5"
        >
            <h2
                id="order-handover"
                className="font-site-heading text-site-fg text-lg font-semibold"
            >
                {pickup ? "Pick up from" : `${label} to`}
            </h2>
            {pickup ? (
                <address className="text-site-body mt-1.5 text-sm not-italic">
                    <span className="text-site-fg block font-medium">
                        {pickup.name}
                    </span>
                    {pickup.address ? (
                        <span className="block whitespace-pre-line break-words">
                            {pickup.address}
                        </span>
                    ) : null}
                </address>
            ) : deliverTo ? (
                <address className="text-site-body mt-1.5 text-sm not-italic">
                    {deliverTo.name ? (
                        <span className="text-site-fg block font-medium">
                            {deliverTo.name}
                        </span>
                    ) : null}
                    {deliverTo.lines.map((line) => (
                        <span key={line} className="block break-words">
                            {line}
                        </span>
                    ))}
                </address>
            ) : null}
        </section>
    );
}

export function OrderConfirmation({
    lookup,
    businessName,
    shopHref = "/shop",
    ordersHref = null,
}: {
    lookup: OrderConfirmationLookup;
    businessName: string;
    /** Back to the shop. */
    shopHref?: string;
    /** The account's Orders, only while the account area serves. */
    ordersHref?: string | null;
}) {
    if (!lookup.ok) {
        const words =
            lookup.reason === "unavailable"
                ? {
                      title: "We couldn't load your order",
                      lead: `Something went wrong on our side. Your order is safe with ${businessName} — try again in a moment.`,
                  }
                : lookup.reason === "signed-out"
                  ? {
                        title: "Sign in to see your order",
                        lead: `Your order is shown to the person who placed it, while they're signed in on ${businessName}'s site.`,
                    }
                  : {
                        title: "We couldn't find that order",
                        lead: `It may still be being confirmed. If you paid, ${businessName} will be in touch.`,
                    };
        return (
            <Frame>
                <h1 className="font-site-heading text-site-fg text-[26px] font-semibold tracking-[-0.03em]">
                    {words.title}
                </h1>
                <p className="text-site-body mt-2 text-sm">{words.lead}</p>
                <div className="mt-6 flex flex-wrap gap-3">
                    <Link href={shopHref} className={linkButton(true)}>
                        Back to the shop
                    </Link>
                </div>
            </Frame>
        );
    }

    const { order } = lookup;
    return (
        <Frame>
            <p className="text-site-muted text-sm font-medium">
                Order {order.orderNumber}
            </p>
            <h1 className="font-site-heading text-site-fg mt-1 text-[26px] font-semibold tracking-[-0.03em] sm:text-[30px]">
                {order.refunded
                    ? "This order was refunded"
                    : "Thank you — your order is placed"}
            </h1>
            <p className="text-site-body mt-2 text-sm">
                {order.refunded
                    ? `${businessName} has sent your money back.`
                    : order.toPay
                      ? `${toPayLead(order.toPay)} ${businessName} will be in touch when it's ready.`
                      : `${businessName} will be in touch when it's ready.`}
            </p>
            <Summary order={order} />
            <Handover order={order} />
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link href={shopHref} className={linkButton(!ordersHref)}>
                    Back to the shop
                </Link>
                {ordersHref ? (
                    <Link href={ordersHref} className={linkButton(true)}>
                        See it in your orders
                    </Link>
                ) : null}
            </div>
        </Frame>
    );
}

/** "You'll pay when you collect your order." — said where it is placed. */
export function toPayLead(toPay: string): string {
    return toPay === "Pay on delivery"
        ? "You'll pay when your order is delivered."
        : "You'll pay when you collect your order.";
}

/** The total's label on an order still to be paid at the handover. */
function toPayTotal(toPay: string): string {
    return toPay === "Pay on delivery"
        ? "To pay on delivery"
        : "To pay when you collect";
}

/** Where a placed order's confirmation lives, on the business's site. */
export function orderConfirmationHref(orderId: string): string {
    return `/shop/order/${encodeURIComponent(orderId)}`;
}

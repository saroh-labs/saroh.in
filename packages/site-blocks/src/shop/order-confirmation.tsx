import Link from "next/link";
import type { ReactNode } from "react";

import { focusRing } from "../booking-flow/styles";
import { formatAmount } from "../lib/money";
import type { NoticeReach } from "../lib/told";
import { toldText } from "../lib/told";
import { cn } from "../lib/utils";
import { SoldByLine } from "../sold-by";

/**
 * The order confirmation on a merchant's site (round-2 P4), at
 * `/shop/order/<ref>`: where the bag sheet's "Order placed" leads, on the
 * business's own domain. The order's number, what was bought, the money,
 * and how it reaches the customer — the pick-up place or the address they
 * gave — then a way back to the shop and, with the account area, to their
 * Orders.
 *
 * It says what happens next: "We've emailed ‹address›" when the business's
 * own email sends the order's notice (the API says, `reach`), and "It's
 * saved in your account" otherwise. It never claims an email that didn't
 * go. Drawn in the site's own tokens only; a merchant's site never wears
 * Saroh's brand.
 *
 * A placed order opens on a mark in the site's accent and the heading at
 * display size: the moment it worked, in the business's own colours. A
 * refunded one has no mark. A read that failed says so as an alert and
 * offers "Try again" on the page's own address.
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
    /** The code that took the discount off, "SAVE10"; absent or null without one. */
    discountCode?: string | null;
    total: string;
    fulfilment: {
        type: string;
        label: string;
        /** `hours` (UX-025): when the place is open; absent when not set. */
        pickup: {
            name: string;
            address: string | null;
            hours?: string | null;
        } | null;
        deliverTo: { name: string | null; lines: string[] } | null;
    };
    refunded: boolean;
    /**
     * Placed to be paid at the handover and not paid yet: "Pay when you
     * collect" or "Pay on delivery". Null once paid, or paid online.
     */
    toPay: string | null;
    /** How they hear about it; absent from an older API: nothing promised. */
    reach?: NoticeReach | null;
    /** The address an email goes to: the account's own. */
    email?: string | null;
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
        "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[calc(var(--site-radius)+10px)] px-5 text-[15px] font-semibold transition-[opacity,transform] duration-100 ease-out active:scale-[0.98]",
        focusRing,
        primary
            ? "bg-site-accent text-site-accent-fg hover:opacity-90"
            : "border-site-border bg-site-surface text-site-fg hover:border-site-fg border",
    );

/** A card on the order page: what was bought, where it goes. */
const panel =
    "border-site-border bg-site-surface rounded-[calc(var(--site-radius)+12px)] border p-5 sm:p-6";

/** The page's heading: the heading face, balanced, one size for every state. */
const pageTitle =
    "font-site-heading text-site-fg text-[calc(clamp(1.625rem,5vw,2.125rem)*var(--site-heading-scale,1))] font-semibold leading-[1.12] tracking-[-0.025em] [text-wrap:balance]";

function Frame({ children }: { children: ReactNode }) {
    return (
        <div className="bg-site-bg mx-auto max-w-[640px] px-5 py-10 sm:py-16">
            {children}
        </div>
    );
}

/** What was bought: each line, then the money. */
function Summary({ order }: { order: OrderConfirmationData }) {
    const money = (amount: string) => formatAmount(amount, order.currency);
    return (
        <section aria-labelledby="order-items" className={cn(panel, "mt-7")}>
            <h2
                id="order-items"
                className="font-site-heading text-site-fg text-[calc(1.125rem*var(--site-heading-scale,1))] font-semibold tracking-[-0.01em]"
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
                            <span className="text-site-body block text-sm">
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
            <dl className="border-site-border mt-1 space-y-2 border-t pt-3.5 text-sm">
                <div className="flex justify-between gap-3">
                    <dt className="text-site-body">Subtotal</dt>
                    <dd className="text-site-fg tabular-nums">
                        {money(order.subtotal)}
                    </dd>
                </div>
                {order.discount ? (
                    <div className="flex justify-between gap-3">
                        <dt className="text-site-body">
                            {order.discountCode
                                ? `Discount (${order.discountCode})`
                                : "Discount"}
                        </dt>
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
                <div className="border-site-border mt-1 flex items-baseline justify-between gap-3 border-t pt-3 text-base font-semibold">
                    <dt className="text-site-fg">
                        {order.refunded
                            ? "Paid, then refunded"
                            : order.toPay
                              ? toPayTotal(order.toPay)
                              : "Paid"}
                    </dt>
                    <dd className="font-site-heading text-site-fg text-[calc(1.375rem*var(--site-heading-scale,1))] tabular-nums tracking-[-0.01em]">
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
        <section aria-labelledby="order-handover" className={cn(panel, "mt-3")}>
            <h2
                id="order-handover"
                className="font-site-heading text-site-fg text-[calc(1.125rem*var(--site-heading-scale,1))] font-semibold tracking-[-0.01em]"
            >
                {pickup ? "Pick-up from" : `${label} to`}
            </h2>
            {pickup ? (
                <address className="text-site-body mt-2 text-[15px] not-italic leading-relaxed">
                    <span className="text-site-fg block font-medium">
                        {pickup.name}
                    </span>
                    {pickup.address ? (
                        <span className="block whitespace-pre-line break-words">
                            {pickup.address}
                        </span>
                    ) : null}
                    {pickup.hours ? (
                        <span className="text-site-body mt-1 block text-sm">
                            Open {pickup.hours}
                        </span>
                    ) : null}
                </address>
            ) : deliverTo ? (
                <address className="text-site-body mt-2 text-[15px] not-italic leading-relaxed">
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
    soldBy = null,
    shopHref = "/shop",
    ordersHref = null,
    signIn = null,
    retryHref = null,
}: {
    lookup: OrderConfirmationLookup;
    businessName: string;
    /** "Sold by ‹legal name›" (DEC-121); null draws none. */
    soldBy?: string | null;
    /** Back to the shop. */
    shopHref?: string;
    /** The account's Orders, only while the account area serves. */
    ordersHref?: string | null;
    /**
     * The way to sign in, drawn when the page was opened signed out: the
     * site's own entry (`AccountEntry`, its "page" variant), which keeps
     * the customer on this page, so signing in shows the order. It leads;
     * "Back to the shop" is the other way out.
     */
    signIn?: ReactNode;
    /**
     * The page's own address: where the order couldn't be loaded, "Try
     * again" asks for it afresh. Null draws none.
     */
    retryHref?: string | null;
}) {
    if (!lookup.ok) {
        const words =
            lookup.reason === "unavailable"
                ? {
                      title: "We couldn't load your order",
                      lead: `Something went wrong on our side. Your order is safe with ${businessName}. Try again in a moment.`,
                  }
                : lookup.reason === "signed-out"
                  ? {
                        title: "Sign in to see your order",
                        lead: `Your order is shown to the person who placed it. Sign in with the email you ordered with and it opens here.`,
                    }
                  : {
                        title: "We couldn't find that order",
                        lead: `It may still be being confirmed. If you paid, ${businessName} will be in touch.`,
                    };
        // Only a signed-out read can be mended by signing in.
        const entry = lookup.reason === "signed-out" ? signIn : null;
        // Only a read that failed can be mended by asking again.
        const retry = lookup.reason === "unavailable" ? retryHref : null;
        return (
            <Frame>
                <div
                    data-page-state={
                        lookup.reason === "unavailable" ? "failed" : "empty"
                    }
                    role={lookup.reason === "unavailable" ? "alert" : undefined}
                >
                    <span
                        aria-hidden="true"
                        className="bg-site-accent block h-0.5 w-10"
                    />
                    <h1 className={cn(pageTitle, "mt-5")}>{words.title}</h1>
                    <p className="text-site-body mt-3 text-base leading-[1.6] [text-wrap:pretty]">
                        {words.lead}
                    </p>
                </div>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                    {entry}
                    {retry ? (
                        // A plain link: the page is asked for again.
                        <a href={retry} className={linkButton(true)}>
                            Try again
                        </a>
                    ) : null}
                    <Link
                        href={shopHref}
                        className={linkButton(!entry && !retry)}
                    >
                        Back to the shop
                    </Link>
                </div>
            </Frame>
        );
    }

    const { order } = lookup;
    return (
        <Frame>
            {/* The moment it worked, in the site's own accent. A refund
                is not one. */}
            {order.refunded ? null : (
                <div
                    aria-hidden="true"
                    data-order-mark=""
                    className="bg-site-accent text-site-accent-fg mb-5 flex size-12 items-center justify-center rounded-full"
                >
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                        <path
                            d="M5 12.5 10 17.5 19 7.5"
                            stroke="currentColor"
                            strokeWidth="2.25"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </div>
            )}
            <p className="text-site-body font-site-mono text-sm font-medium tracking-[0.02em]">
                Order {order.orderNumber}
            </p>
            <h1 className={cn(pageTitle, "mt-1.5")}>
                {order.refunded
                    ? "This order was refunded"
                    : "Thank you, your order is placed"}
            </h1>
            <p className="text-site-body mt-3 text-base leading-[1.6]">
                {order.refunded
                    ? `${businessName} has sent your money back.`
                    : order.toPay
                      ? `${toPayLead(order.toPay)} ${businessName} will be in touch when it's ready.`
                      : `${businessName} will be in touch when it's ready.`}
            </p>
            {order.refunded ? null : (
                <p className="text-site-body mt-1 text-base leading-[1.6] [overflow-wrap:anywhere]">
                    {toldText(order.reach, order.email)}
                </p>
            )}
            <Summary order={order} />
            <Handover order={order} />
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link href={shopHref} className={linkButton(!ordersHref)}>
                    Back to the shop
                </Link>
                {ordersHref ? (
                    <Link href={ordersHref} className={linkButton(true)}>
                        See it in your orders
                    </Link>
                ) : null}
            </div>
            {/* Who sold it, in the business's own name (DEC-121). */}
            <SoldByLine line={soldBy} className="text-site-muted mt-6" />
        </Frame>
    );
}

/** "You'll pay at pick-up.", said where it is placed. */
export function toPayLead(toPay: string): string {
    return toPay === "Pay on delivery"
        ? "You'll pay when your order is delivered."
        : "You'll pay at pick-up.";
}

/** The total's label on an order still to be paid at the handover. */
function toPayTotal(toPay: string): string {
    return toPay === "Pay on delivery"
        ? "To pay on delivery"
        : "To pay at pick-up";
}

/** Where a placed order's confirmation lives, on the business's site. */
export function orderConfirmationHref(orderId: string): string {
    return `/shop/order/${encodeURIComponent(orderId)}`;
}

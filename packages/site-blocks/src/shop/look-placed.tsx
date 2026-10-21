import type { LookId } from "@saroh/block-contract";
import Link from "next/link";
import type { ReactNode } from "react";

import { formatAmount } from "../lib/money";
import { toldText } from "../lib/told";
import { cn } from "../lib/utils";
import { SoldByLine } from "../sold-by";
import { SHOP_LABEL, SHOP_TITLE, shopOutline, shopPrimary } from "./look-shop";
import type {
    OrderConfirmationData,
    OrderConfirmationLookup,
} from "./order-confirmation";
import { OrderConfirmation, toPayLead } from "./order-confirmation";

/**
 * Order placed under a look (DEC-172, plan U11, #1102): `/shop/order/<ref>`,
 * the boards VA17, VD17 and VB17. Classic keeps `OrderConfirmation`, which
 * also draws every page this one can't (signed out, not found, a read that
 * failed), in the look's tokens.
 *
 * ONLY WHAT IS KNOWN. The page is the order as placed: its number, what was
 * bought and the money, how it reaches the customer, and what happens next
 * by email only when the business's own email sends it (`toldText`). The
 * boards' stage tracker and "Ready from Tue 7 am" need the order's stage
 * and the place's hours, which this read doesn't carry: the account's
 * Orders tracks it (U12). A pick-up order never says "on its way"; only a
 * delivery does.
 *
 * The one filled button is "See it in your orders" where the account area
 * serves, else "Back to the shop". The receipt's frame fades and rises over
 * the look's slow step (200 ms, `data-site-rise`).
 */

/** What happens next, in words: pick-up and delivery said apart. */
export function placedNext(order: OrderConfirmationData): string {
    const pickup =
        order.fulfilment.type === "PICKUP" || order.fulfilment.pickup !== null;
    if (order.refunded) return "Your money has been sent back.";
    const pay = order.toPay ? `${toPayLead(order.toPay)} ` : "";
    return pickup
        ? `${pay}We'll email you when it's ready for pick-up.`
        : `${pay}We'll email you when it's on its way.`;
}

export function LookOrderPlaced({
    look,
    lookup,
    businessName,
    soldBy = null,
    shopHref = "/shop",
    ordersHref = null,
    signIn = null,
    retryHref = null,
}: {
    look: LookId;
    lookup: OrderConfirmationLookup;
    businessName: string;
    soldBy?: string | null;
    shopHref?: string;
    ordersHref?: string | null;
    signIn?: ReactNode;
    retryHref?: string | null;
}) {
    if (!lookup.ok) {
        return (
            <OrderConfirmation
                lookup={lookup}
                businessName={businessName}
                soldBy={soldBy}
                shopHref={shopHref}
                ordersHref={ordersHref}
                signIn={signIn}
                retryHref={retryHref}
            />
        );
    }
    const { order } = lookup;
    const money = (amount: string) => formatAmount(amount, order.currency);
    const { pickup, deliverTo, label } = order.fulfilment;

    return (
        <section
            data-look-placed={look}
            className="max-w-site-content mx-auto w-full px-[var(--site-page-margin,20px)] py-[calc(var(--site-section-padding,64px)*0.75)]"
        >
            <div className="grid gap-10 min-[1000px]:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] min-[1000px]:items-start">
                <div className="min-w-0">
                    <h1 className={SHOP_TITLE[look]}>
                        {order.refunded
                            ? "This order was refunded"
                            : "Order placed."}
                    </h1>
                    <p className="text-site-body mt-5 max-w-[46ch] text-[16.5px] leading-[1.6] [overflow-wrap:anywhere]">
                        {order.refunded
                            ? null
                            : `${toldText(order.reach, order.email)} `}
                        {placedNext(order)}
                    </p>
                    <div className="mt-7 flex flex-wrap gap-3">
                        {ordersHref ? (
                            <Link href={ordersHref} className={shopPrimary()}>
                                See it in your orders
                            </Link>
                        ) : null}
                        <Link
                            href={shopHref}
                            className={ordersHref ? shopOutline : shopPrimary()}
                        >
                            Back to the shop
                        </Link>
                    </div>
                </div>

                <div
                    data-site-rise=""
                    data-order-receipt=""
                    className={cn(
                        "rounded-site-s min-w-0 p-6 min-[700px]:p-8",
                        look === "folio"
                            ? "border-site-fg bg-site-surface border outline outline-1 outline-offset-[5px] outline-[hsl(var(--site-fg))]"
                            : look === "live"
                              ? "bg-site-fg text-site-bg"
                              : "border-site-border bg-site-surface border",
                    )}
                >
                    <p
                        className={cn(
                            SHOP_LABEL,
                            look === "live" && "text-site-bg opacity-80",
                        )}
                    >
                        Order {order.orderNumber}
                    </p>
                    <ul className="m-0 mt-4 list-none p-0 text-[15.5px]">
                        {order.lines.map((line, i) => (
                            <li
                                key={`${line.name}-${line.variant ?? ""}-${i}`}
                                className="flex gap-3 border-b border-dotted border-[color-mix(in_srgb,currentColor_30%,transparent)] py-3"
                            >
                                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                                    {line.quantity} × {line.name}
                                    {line.variant
                                        ? `, ${line.variant.toLowerCase()}`
                                        : ""}
                                </span>
                                <span className="tabular-nums">
                                    {money(line.amount)}
                                </span>
                            </li>
                        ))}
                        {order.discount ? (
                            <li className="flex gap-3 border-b border-dotted border-[color-mix(in_srgb,currentColor_30%,transparent)] py-3">
                                <span className="flex-1">
                                    {order.discountCode
                                        ? `Code ${order.discountCode}`
                                        : "Discount"}
                                </span>
                                <span className="tabular-nums">
                                    −{money(order.discount)}
                                </span>
                            </li>
                        ) : null}
                        {order.delivery ? (
                            <li className="flex gap-3 border-b border-dotted border-[color-mix(in_srgb,currentColor_30%,transparent)] py-3">
                                <span className="flex-1">{label}</span>
                                <span className="tabular-nums">
                                    {money(order.delivery)}
                                </span>
                            </li>
                        ) : null}
                        <li className="flex items-baseline gap-3 pt-4 font-semibold">
                            <span className="flex-1">
                                {order.refunded
                                    ? "Paid, then refunded"
                                    : order.toPay
                                      ? order.toPay === "Pay on delivery"
                                          ? "To pay on delivery"
                                          : "To pay at pick-up"
                                      : "Paid"}
                            </span>
                            <span className="font-site-heading text-[calc(1.5rem*var(--site-heading-scale,1))] tabular-nums">
                                {money(order.total)}
                            </span>
                        </li>
                    </ul>
                    {pickup || deliverTo ? (
                        <dl className="mt-6 grid grid-cols-[6rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-[14.5px] leading-relaxed">
                            <dt
                                className={cn(
                                    SHOP_LABEL,
                                    look === "live" &&
                                        "text-site-bg opacity-80",
                                )}
                            >
                                {pickup ? "Pick up" : "Deliver to"}
                            </dt>
                            <dd className="m-0 [overflow-wrap:anywhere]">
                                {pickup ? (
                                    <>
                                        {pickup.address ?? pickup.name}
                                        {pickup.hours
                                            ? `. Open ${pickup.hours}.`
                                            : null}
                                    </>
                                ) : deliverTo ? (
                                    <>
                                        {deliverTo.name
                                            ? `${deliverTo.name}, `
                                            : null}
                                        {deliverTo.lines.join(", ")}
                                    </>
                                ) : null}
                            </dd>
                        </dl>
                    ) : null}
                </div>
            </div>
            <SoldByLine line={soldBy} className="text-site-muted mt-8" />
        </section>
    );
}

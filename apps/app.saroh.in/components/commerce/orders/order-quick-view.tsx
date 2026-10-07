"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { BusinessDate } from "@/components/shared/business-zone";
import { QuickLook } from "@/components/shared/quick-look";
import { customerHref } from "@/lib/customers/links";
import { formatMoneyMajor } from "@/lib/format/money";
import { attentionLines } from "@/lib/orders/attention";
import type { OrderRow } from "@/lib/orders/business-service";
import { goesToAddress } from "@/lib/orders/lifecycle";
import { loadOrderQuickView } from "@/lib/orders/list-actions";
import { rowCustomer } from "@/lib/orders/list-row";
import type { OrderRead } from "@/lib/orders/read";
import type { OrderAbilities } from "@/lib/orders/row-menu";
import {
    orderPageHref,
    quickNext,
    quickPayment,
    quickSteps,
} from "@/lib/orders/row-menu";
import { quickVisitsText } from "@/lib/orders/visits";

import { useOrderStep } from "./use-order-step";

type Read =
    | { state: "loading" }
    | { state: "failed"; error: string }
    | { state: "ready"; order: OrderRead };

const CHIP = {
    done: "bg-success-subtle text-success-subtle-foreground font-medium",
    now: "bg-foreground text-background font-bold",
    todo: "bg-muted text-muted-foreground font-medium",
    ended: "bg-destructive-subtle text-destructive-subtle-foreground font-bold",
} as const;

/**
 * An order's quick view, from the Orders list (plan B, B5), after the
 * "Saroh Orders Screen" design's side panel: the steps with the one it is
 * at, the customer's Needs attention (B15, as the API lets this viewer see
 * it), the items, the money (with `order:read`), the customer (their phone
 * and email only with `contact:read`, which the API decides), the address
 * and notes — then "Open full page" and the next action ("Mark ready").
 *
 * It reads the order Order Detail reads (`?view=quick`) when it opens; the
 * row answers the heading at once. A read that fails is said in the panel
 * with Try again, and the list behind it stays. Escape, the backdrop and
 * Close shut it, and focus goes back to the row that opened it.
 *
 * An appointment's visits are marked on Order Detail (DESIGN-NOTES), so it
 * offers no next action here.
 *
 * On a phone (DEC-067) a card opens the same panel as a sheet from the
 * bottom (`side="bottom"`), rather than going straight to the full page.
 */
export function OrderQuickView({
    row,
    can,
    onOpenChange,
    side = "right",
}: {
    /** The row it opened from; null when closed. */
    row: OrderRow | null;
    can: OrderAbilities;
    onOpenChange: (open: boolean) => void;
    /** From the right at the desk; from the bottom on a phone (B5). */
    side?: "right" | "bottom";
}) {
    const [read, setRead] = useState<Read>({ state: "loading" });
    const [attempt, setAttempt] = useState(0);
    const id = row?.id ?? null;
    const ref = row ? `#${row.orderId}` : "";

    // A new row starts a new read.
    const [wasId, setWasId] = useState(id);
    if (id !== wasId) {
        setWasId(id);
        setRead({ state: "loading" });
    }

    useEffect(() => {
        if (!id) return;
        let live = true;
        // The action itself can fail — the server down, a 500 before it
        // answers — and then it rejects rather than returning an error.
        loadOrderQuickView(id, ref).then(
            (res) => {
                if (!live) return;
                setRead(
                    res.ok
                        ? { state: "ready", order: res.data }
                        : { state: "failed", error: res.error },
                );
            },
            () => {
                if (!live) return;
                setRead({
                    state: "failed",
                    error: `Order ${ref} couldn't be loaded. Try again.`,
                });
            },
        );
        return () => {
            live = false;
        };
    }, [id, ref, attempt]);

    // After a step, read the order again: the panel shows where it is now.
    const step = useOrderStep(() => setAttempt((n) => n + 1));

    if (!row) {
        return (
            <QuickLook
                open={false}
                side={side}
                onOpenChange={onOpenChange}
                title=""
                description=""
            >
                {null}
            </QuickLook>
        );
    }

    const order = read.state === "ready" ? read.order : null;
    const next = order ? quickNext(order, can) : null;
    const customer = rowCustomer(row);

    return (
        <QuickLook
            open
            side={side}
            close="plain"
            closeLabel="Close quick view"
            onOpenChange={onOpenChange}
            title={`${ref} · ${customer}`}
            titleClassName="font-display text-[20px] font-semibold tracking-[-0.02em]"
            subtitle={
                <>
                    <BusinessDate iso={row.placedAt} variant="moment" /> ·{" "}
                    {row.store.name} · {row.fulfilmentLabel}
                </>
            }
            description={`Order ${ref} for ${customer}, at a glance.`}
            footer={
                <>
                    <Button
                        asChild
                        variant="outline"
                        className="mr-auto h-[38px] cursor-pointer gap-[7px] rounded-[9px] px-3.5 text-[13px] font-semibold active:scale-[0.98] coarse:h-11"
                    >
                        <Link href={orderPageHref(row.store.id, row.id)}>
                            Open full page
                            <ChevronRight aria-hidden className="size-[13px]" />
                        </Link>
                    </Button>
                    {order && next ? (
                        next.via === "page" ? (
                            <Button
                                asChild
                                className="h-[38px] cursor-pointer rounded-[9px] px-3.5 text-[13px] font-semibold active:scale-[0.98] coarse:h-11"
                            >
                                <Link
                                    href={orderPageHref(
                                        row.store.id,
                                        row.id,
                                        "courier",
                                    )}
                                >
                                    {next.label}…
                                </Link>
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                disabled={step.busy}
                                onClick={() =>
                                    step.take({
                                        id: order.id,
                                        orderId: order.orderId,
                                        stage: order.stage,
                                        to: next.to,
                                    })
                                }
                                className="h-[38px] cursor-pointer rounded-[9px] px-3.5 text-[13px] font-semibold active:scale-[0.98] coarse:h-11"
                            >
                                {next.label}
                            </Button>
                        )
                    ) : null}
                </>
            }
        >
            {read.state === "failed" ? (
                <div
                    role="alert"
                    className="flex flex-wrap items-center gap-2.5 rounded-[11px] border border-destructive-subtle-foreground/40 bg-destructive-subtle px-3.5 py-3 text-[13px] text-destructive-subtle-foreground"
                >
                    <span className="min-w-0 flex-1">{read.error}</span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            setRead({ state: "loading" });
                            setAttempt((n) => n + 1);
                        }}
                    >
                        Try again
                    </Button>
                </div>
            ) : order ? (
                <QuickViewBody order={order} />
            ) : (
                <div className="grid gap-3" role="status">
                    <span className="sr-only">Loading order {ref}</span>
                    <div className="h-6 w-3/4 rounded-full bg-muted" />
                    <div className="h-24 rounded-[11px] bg-muted" />
                    <div className="h-4 w-1/2 rounded-[6px] bg-muted" />
                </div>
            )}
        </QuickLook>
    );
}

/**
 * The customer's name, a Saffron link to Customer Detail as the design
 * draws it (DEC-073): Ink on hover, a step lighter pressed, and a ring on
 * keyboard focus.
 */
const CUSTOMER_LINK =
    "cursor-pointer rounded-sm text-brand transition-colors duration-fast hover:text-foreground active:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function QuickViewBody({ order }: { order: OrderRead }) {
    const money = order.money;
    const currency = money?.currency ?? "INR";
    const format = (a: string | number) =>
        formatMoneyMajor(a, currency) ?? String(a);
    const payment = quickPayment(order, format);
    const appointment =
        order.fulfilmentType === "APPOINTMENT_IN_PERSON" ||
        order.fulfilmentType === "APPOINTMENT_ONLINE";
    const address =
        goesToAddress(order) && order.deliveryAddress
            ? [
                  order.deliveryAddress.line1,
                  order.deliveryAddress.line2,
                  [order.deliveryAddress.city, order.deliveryAddress.postalCode]
                      .filter(Boolean)
                      .join(" "),
                  order.deliveryAddress.state,
                  // The number it's delivered to: the order's own, which
                  // whoever works it sees (review #19).
                  order.deliveryAddress.phone,
              ]
                  .filter(Boolean)
                  .join("\n")
            : null;
    const c = order.customer;
    const customerLink = c
        ? c.contactId
            ? `/customers/${encodeURIComponent(c.contactId)}`
            : customerHref(order.store.id, c.id)
        : null;
    // A walk-in (B13) has no record to open: their name and phone only.
    const walkIn = !c ? (order.walkIn ?? null) : null;
    const reach = c
        ? [c.phone, c.email].filter(Boolean).join(" · ")
        : (walkIn?.phone ?? "");

    return (
        <>
            <ol aria-label="Steps" className="flex flex-wrap gap-1">
                {quickSteps(order).map((s) => (
                    <li
                        key={s.label}
                        aria-current={s.state === "now" ? "step" : undefined}
                        className={cn(
                            "rounded-full px-[9px] py-[3px] text-[11.5px]",
                            CHIP[s.state],
                        )}
                    >
                        {s.label}
                    </li>
                ))}
            </ol>

            {/* Needs attention (B15): what the API let this viewer see. */}
            {attentionLines(order.attention).map((a) => (
                <div
                    key={a.id}
                    role="alert"
                    className="rounded-[9px] bg-destructive-subtle px-[11px] py-[9px] text-[13px] leading-[1.45] text-destructive-subtle-foreground"
                >
                    <strong>{a.head}</strong>
                    {a.detail ? ` ${a.detail}` : null}
                </div>
            ))}
            {order.attention === null ? (
                <div
                    role="status"
                    className="rounded-[9px] bg-muted px-[11px] py-[9px] text-[13px] leading-[1.45] text-muted-foreground"
                >
                    <strong className="text-foreground">
                        Needs attention: not available.
                    </strong>{" "}
                    It couldn&apos;t be read, so check with the customer before
                    it goes out.
                </div>
            ) : null}

            <section
                aria-label="Items"
                className="rounded-[11px] border border-border bg-card"
            >
                {order.items.map((i, k) => (
                    <div
                        key={i.id}
                        className={cn(
                            "flex items-baseline gap-2.5 px-[13px] py-2.5 text-[13px]",
                            k > 0 && "border-t border-border/70",
                        )}
                    >
                        <span className="min-w-0 flex-1">
                            {i.name ?? "A product that's gone"}
                            {i.variantTitle ? (
                                <span className="text-muted-foreground">
                                    , {i.variantTitle}
                                </span>
                            ) : null}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                            × {i.quantity}
                        </span>
                        {i.price !== undefined ? (
                            <span className="min-w-16 text-right tabular-nums">
                                {format(Number(i.price) * i.quantity)}
                            </span>
                        ) : null}
                    </div>
                ))}
                {money && !appointment ? (
                    <div className="flex gap-2.5 border-t border-border/70 px-[13px] py-[9px] text-[12.5px] text-muted-foreground">
                        <span className="flex-1">
                            {order.fulfilmentType === "PICKUP"
                                ? `Pick-up at ${order.store.name}`
                                : order.fulfilmentLabel}
                        </span>
                        <span className="tabular-nums">
                            {Number(money.shipping) > 0
                                ? format(money.shipping)
                                : "Free"}
                        </span>
                    </div>
                ) : null}
                {money ? (
                    <div className="flex gap-2.5 border-t border-border/70 px-[13px] py-2.5 text-[14px] font-semibold">
                        <span className="flex-1">Total</span>
                        <span className="font-display tabular-nums">
                            {format(money.total)}
                        </span>
                    </div>
                ) : null}
            </section>

            <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px] leading-[1.45]">
                {payment ? (
                    <>
                        <dt className="text-muted-foreground">Payment</dt>
                        <dd>{payment}</dd>
                    </>
                ) : null}
                <dt className="text-muted-foreground">Customer</dt>
                <dd className="min-w-0">
                    {c && customerLink ? (
                        <Link href={customerLink} className={CUSTOMER_LINK}>
                            {c.name ?? c.email ?? "Customer"}
                        </Link>
                    ) : walkIn ? (
                        <span>Walk-in · {walkIn.name}</span>
                    ) : (
                        <span>Their record is gone</span>
                    )}
                    {c ? (
                        <span className="text-muted-foreground">
                            {` · ${c.orderCount} ${c.orderCount === 1 ? "order" : "orders"}`}
                        </span>
                    ) : null}
                    {reach ? (
                        <span className="block break-words text-muted-foreground">
                            {reach}
                        </span>
                    ) : null}
                </dd>
                {address ? (
                    <>
                        <dt className="text-muted-foreground">Address</dt>
                        <dd className="whitespace-pre-line">{address}</dd>
                    </>
                ) : null}
                {order.notes ? (
                    <>
                        <dt className="text-muted-foreground">Note</dt>
                        <dd className="whitespace-pre-line break-words">
                            {order.notes}
                        </dd>
                    </>
                ) : null}
                {appointment ? (
                    <>
                        <dt className="text-muted-foreground">Visits</dt>
                        <dd>
                            {order.visits
                                ? `${quickVisitsText(order.visits, order.visits.service.timezone, new Date())}. `
                                : null}
                            Marked on the full page, as each one happens.
                        </dd>
                    </>
                ) : null}
            </dl>
        </>
    );
}

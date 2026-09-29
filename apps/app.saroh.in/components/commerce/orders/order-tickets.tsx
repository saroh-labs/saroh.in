"use client";

import { Button } from "@saroh/ui/button";
import { ChevronLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { ViewerDate } from "@/components/shared/viewer-date";
import { formatMoneyMajor } from "@/lib/format/money";
import { goesToAddress } from "@/lib/orders/lifecycle";
import type { OrderRead } from "@/lib/orders/read";
import {
    ticketAttention,
    ticketLine,
    ticketsSummary,
    ticketWho,
} from "@/lib/orders/tickets";

/**
 * Several orders' tickets, one to a printed page (plan B, B6), from the
 * Orders list's bulk "Print tickets (N)", after the "Saroh Orders Screen"
 * design: "Opens N kitchen tickets to print, oldest first."
 *
 * Each ticket is the design's slip (Saroh Order Detail's `slip`): the
 * customer's Needs attention that may go on paper in a ruled box — never a
 * sensitive entry — then the number, who and how it leaves, when and where
 * it was placed, the lines, the address for an order that goes to one, the
 * note, and the total for someone who reads the money. The print dialog
 * opens once the page has painted, as it does from an order's own "Print"
 * (`use-arrival.ts`); the bar above the tickets never prints.
 */
export function OrderTickets({
    orders,
    noTicket,
    failed,
}: {
    /** Oldest first, each with a ticket to print. */
    orders: OrderRead[];
    /** Asked for, but their way of leaving prints nothing. */
    noTicket: number;
    /** Asked for, but they couldn't be read. */
    failed: number;
}) {
    const summary = ticketsSummary({
        printed: orders.length,
        noTicket,
        failed,
    });
    const printed = useRef(false);
    useEffect(() => {
        if (printed.current || orders.length === 0) return;
        printed.current = true;
        // After the page has painted, so every ticket prints whole.
        const timer = window.setTimeout(() => window.print(), 300);
        return () => window.clearTimeout(timer);
    }, [orders.length]);

    return (
        <main className="ticket-print w-full px-4 pb-[26px] pt-5 sm:px-6">
            <div className="mb-5 flex flex-wrap items-center gap-2.5 print:hidden">
                <div className="min-w-0 flex-1">
                    <h1 className="font-display text-[22px] font-semibold tracking-[-0.02em]">
                        {summary.title}
                    </h1>
                    <p className="text-[12.5px] text-muted-foreground">
                        Oldest first, one to a page.
                        {summary.notes.length > 0
                            ? ` ${summary.notes.join(" ")}`
                            : ""}
                    </p>
                </div>
                <Button
                    asChild
                    variant="outline"
                    className="h-[38px] cursor-pointer gap-1.5 rounded-[9px] px-3.5 text-[13px] font-semibold active:scale-[0.98] coarse:h-11"
                >
                    <Link href="/commerce/orders">
                        <ChevronLeft aria-hidden className="size-4" />
                        Orders
                    </Link>
                </Button>
                {orders.length > 0 ? (
                    <Button
                        type="button"
                        onClick={() => window.print()}
                        className="h-[38px] cursor-pointer gap-1.5 rounded-[9px] px-3.5 text-[13px] font-semibold active:scale-[0.98] coarse:h-11"
                    >
                        <Printer aria-hidden className="size-4" />
                        Print
                    </Button>
                ) : null}
            </div>
            {orders.length === 0 ? (
                <p
                    role="status"
                    className="rounded-[11px] border border-border bg-card px-4 py-3.5 text-[13px]"
                >
                    Nothing to print.{" "}
                    {summary.notes.join(" ") ||
                        "Pick orders on the list first."}
                </p>
            ) : (
                <ol
                    aria-label="Tickets"
                    className="flex flex-wrap items-start gap-4 print:block"
                >
                    {orders.map((order) => (
                        <li key={order.id} className="ticket-page">
                            <Ticket order={order} />
                        </li>
                    ))}
                </ol>
            )}
        </main>
    );
}

function Ticket({ order }: { order: OrderRead }) {
    const money = order.money;
    const format = (a: string | number) =>
        formatMoneyMajor(a, money?.currency ?? "INR") ?? String(a);
    const attention = ticketAttention(order.attention);
    const address =
        goesToAddress(order) && order.deliveryAddress
            ? [
                  order.deliveryAddress.line1,
                  order.deliveryAddress.line2,
                  [order.deliveryAddress.city, order.deliveryAddress.postalCode]
                      .filter(Boolean)
                      .join(" "),
                  order.deliveryAddress.phone,
              ]
                  .filter(Boolean)
                  .join(", ")
            : null;

    return (
        <article
            aria-label={`${order.ticketName ?? "Ticket"} for order ${order.orderId}`}
            className="w-[300px] max-w-full rounded-[11px] border border-border bg-card px-4 py-3.5 text-[14px] leading-[1.4] print:w-[72mm] print:rounded-none print:border-0 print:p-0"
        >
            {attention.lines.length > 0 ? (
                <div className="mb-2 border-2 border-foreground px-1.5 py-1.5 font-bold">
                    {attention.lines.map((line) => (
                        <div key={line}>{line}</div>
                    ))}
                </div>
            ) : null}
            {attention.unchecked ? (
                <div className="mb-2 border-2 border-foreground px-1.5 py-1.5 font-bold">
                    Needs attention couldn&apos;t be checked. Ask the customer
                    before it goes out.
                </div>
            ) : null}
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {order.ticketName}
            </p>
            <h2 className="font-display text-[22px] font-semibold">
                #{order.orderId}
            </h2>
            <p>
                {ticketWho(order)} · {order.fulfilmentLabel}
            </p>
            <p className="text-muted-foreground">
                <ViewerDate iso={order.placedAt} variant="moment" /> ·{" "}
                {order.store.name}
            </p>
            <hr className="my-2 border-border" />
            <table className="w-full">
                <tbody>
                    {order.items.map((line) => (
                        <tr key={line.id}>
                            <td className="py-[3px] pr-2 align-top">
                                {ticketLine(line)}
                            </td>
                            {line.price !== undefined ? (
                                <td className="py-[3px] text-right align-top tabular-nums">
                                    {format(Number(line.price) * line.quantity)}
                                </td>
                            ) : null}
                        </tr>
                    ))}
                </tbody>
            </table>
            {address ? (
                <p className="mt-2 break-words">
                    <strong>To:</strong> {address}
                </p>
            ) : null}
            {order.notes ? (
                <p className="mt-2 whitespace-pre-line break-words">
                    <strong>Note:</strong> {order.notes}
                </p>
            ) : null}
            {money ? (
                <>
                    <hr className="my-2 border-border" />
                    <p className="font-bold tabular-nums">
                        Total {format(money.total)}
                    </p>
                </>
            ) : null}
        </article>
    );
}

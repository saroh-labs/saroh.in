"use client";

import Link from "next/link";

import type { DetailOrder } from "@/lib/customer-workspace/detail";
import type { OrderFilter } from "@/lib/customer-workspace/view";
import {
    isOpen,
    orderStatus,
    orderWhat,
    ordersShown,
    whenText,
} from "@/lib/customer-workspace/view";
import { money } from "@/lib/subscriptions/view";

import { Chips, Empty, RowPill } from "./parts";

const COLS =
    "grid grid-cols-[70px_minmax(0,1.6fr)_90px_90px_100px_90px] gap-2.5";

/**
 * Their orders, newest first, from the store customers linked to them. The
 * table scrolls inside its card on a phone rather than the page.
 */
export function OrdersTab({
    rows,
    count,
    filter,
    onFilter,
    timeZone,
    now,
}: {
    rows: DetailOrder[];
    count: number;
    filter: OrderFilter;
    onFilter: (f: OrderFilter) => void;
    timeZone: string;
    now: Date;
}) {
    if (!rows.length) {
        return (
            <Empty title="No orders yet">
                Orders appear here as soon as they are placed, newest first.
            </Empty>
        );
    }
    const shown = ordersShown(rows, filter);
    return (
        <>
            <Chips
                label="Which orders"
                value={filter}
                onChange={onFilter}
                chips={[
                    { key: "all", label: `All · ${count}` },
                    {
                        key: "open",
                        label: `Open · ${rows.filter(isOpen).length}`,
                    },
                    { key: "past", label: "Past" },
                ]}
            />
            <div className="overflow-x-auto rounded-xl border border-border bg-card px-[18px] pb-1.5">
                <div className="min-w-[560px]">
                    <div
                        className={`${COLS} border-b border-foreground/10 pb-[7px] pt-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground`}
                    >
                        <span>Order</span>
                        <span>What</span>
                        <span>Total</span>
                        <span>Storefront</span>
                        <span>When</span>
                        <span>Status</span>
                    </div>
                    {shown.map((o) => (
                        <div
                            key={o.id}
                            className={`${COLS} items-center border-b border-foreground/10 py-2.5 text-[13px] last:border-b-0`}
                        >
                            <Link
                                href={`/commerce/orders/${o.id}`}
                                className="font-mono text-[12px] text-brand hover:text-foreground"
                            >
                                #{o.number}
                            </Link>
                            <span className="text-foreground/75">
                                {orderWhat(o)}
                            </span>
                            <span className="tabular-nums">
                                {o.total && o.currency
                                    ? money(o.total, o.currency)
                                    : "—"}
                            </span>
                            <span className="text-muted-foreground">
                                {o.via.storefront.name}
                            </span>
                            <span className="text-muted-foreground">
                                {whenText(o.placedAt, timeZone, now)}
                            </span>
                            <span>
                                <RowPill tone={isOpen(o) ? "ok" : "off"}>
                                    {orderStatus(o)}
                                </RowPill>
                            </span>
                        </div>
                    ))}
                    {!shown.length ? (
                        <p className="py-3 text-[13px] text-muted-foreground">
                            {filter === "open"
                                ? "Nothing open — every order is done."
                                : "No past orders yet."}
                        </p>
                    ) : null}
                </div>
            </div>
            {count > rows.length ? (
                <p className="mt-2 text-[12px] text-muted-foreground">
                    The latest {rows.length} of {count} orders.{" "}
                    <Link
                        href="/commerce/orders"
                        className="font-semibold text-brand hover:text-foreground"
                    >
                        All orders
                    </Link>
                </p>
            ) : null}
        </>
    );
}

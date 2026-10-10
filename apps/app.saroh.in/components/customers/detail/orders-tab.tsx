"use client";

import { OrderCardFrame } from "@/components/commerce/orders/order-row";
import { formatDate } from "@/lib/format/datetime";
import { formatMoneyMajor } from "@/lib/format/money";

import type { DetailOrder } from "@/lib/customer-workspace/detail";
import type { OrderFilter } from "@/lib/customer-workspace/view";
import {
    isOpen,
    orderStatus,
    orderWhat,
    ordersShown,
} from "@/lib/customer-workspace/view";

import { StatusBadge } from "@/components/shared/status-badge";
import { TextLink } from "@saroh/ui/text-link";
import { Chips, Empty } from "./parts";

const COLS =
    "grid grid-cols-[70px_minmax(0,1.6fr)_90px_90px_100px_90px] gap-2.5";

/**
 * Their orders, newest first, from the store customers linked to them. At
 * the desk a table; on a phone (under 760px) a card per order in the Orders
 * list's own frame, so nothing hides sideways.
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
            <div className="overflow-x-auto rounded-xl border border-border bg-card px-[18px] pb-1.5 max-[759px]:hidden">
                <div className="min-w-[560px]">
                    <div
                        className={`${COLS} label border-b border-border pb-[7px] pt-2.5`}
                    >
                        <span>Order</span>
                        <span>What</span>
                        <span>Total</span>
                        <span>Location</span>
                        <span>When</span>
                        <span>Status</span>
                    </div>
                    {shown.map((o) => (
                        <div
                            key={o.id}
                            className={`${COLS} items-center border-b border-foreground/10 py-2.5 text-[13px] last:border-b-0`}
                        >
                            <TextLink
                                href={`/commerce/orders/${o.id}`}
                                className="font-mono text-[12px]"
                            >
                                #{o.number}
                            </TextLink>
                            <span className="text-foreground/75">
                                {orderWhat(o)}
                            </span>
                            <span className="tabular-nums">
                                {o.total && o.currency
                                    ? formatMoneyMajor(o.total, o.currency)
                                    : "—"}
                            </span>
                            <span className="text-muted-foreground">
                                {o.via.storefront.name}
                            </span>
                            <span className="text-muted-foreground">
                                {formatDate(o.placedAt, timeZone, {
                                    now,
                                    relative: true,
                                })}
                            </span>
                            <span>
                                <StatusBadge tone={isOpen(o) ? "ok" : "off"}>
                                    {orderStatus(o)}
                                </StatusBadge>
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
            {shown.length ? (
                <ul
                    aria-label="Their orders"
                    className="flex flex-col gap-2 min-[760px]:hidden"
                >
                    {shown.map((o) => (
                        <OrderCardFrame
                            key={o.id}
                            href={`/commerce/orders/${o.id}`}
                            title={
                                <>
                                    {orderWhat(o)}
                                    <span className="sr-only">
                                        , order #{o.number}
                                    </span>
                                </>
                            }
                            aside={
                                o.total && o.currency ? (
                                    <span className="font-display text-[14px] font-semibold tabular-nums">
                                        {formatMoneyMajor(o.total, o.currency)}
                                    </span>
                                ) : null
                            }
                            meta={
                                <>
                                    <span className="font-mono">
                                        #{o.number}
                                    </span>
                                    <StatusBadge
                                        tone={isOpen(o) ? "ok" : "off"}
                                    >
                                        {orderStatus(o)}
                                    </StatusBadge>
                                </>
                            }
                            footer={
                                <div className="text-[12px] text-muted-foreground">
                                    {formatDate(o.placedAt, timeZone, {
                                        now,
                                        relative: true,
                                    })}
                                    {` · ${o.via.storefront.name}`}
                                </div>
                            }
                        />
                    ))}
                </ul>
            ) : (
                <p className="rounded-xl border border-border bg-card p-3 text-[13px] text-muted-foreground min-[760px]:hidden">
                    {filter === "open"
                        ? "Nothing open — every order is done."
                        : "No past orders yet."}
                </p>
            )}
            {count > rows.length ? (
                <p className="mt-2 text-[12px] text-muted-foreground">
                    The latest {rows.length} of {count} orders.{" "}
                    <TextLink href="/commerce/orders">All orders</TextLink>
                </p>
            ) : null}
        </>
    );
}

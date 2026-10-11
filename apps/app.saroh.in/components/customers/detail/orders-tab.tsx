"use client";

import { OrderCardFrame } from "@/components/commerce/orders/order-row";
import { formatDate } from "@/lib/format/datetime";
import { formatMoneyMajor } from "@/lib/format/money";
import { AbsentValue } from "@saroh/ui/absent-value";
import { EmptyState } from "@saroh/ui/data-state";

import type { DetailOrder } from "@/lib/customer-workspace/detail";
import type { OrderFilter } from "@/lib/customer-workspace/view";
import {
    isOpen,
    orderStatus,
    orderWhat,
    ordersShown,
} from "@/lib/customer-workspace/view";

import { listTable } from "@/components/shared/list-toolbar";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@saroh/ui/lib/utils";
import { TextLink } from "@saroh/ui/text-link";
import { Chips, Empty } from "./parts";

const COLS =
    "grid grid-cols-[70px_minmax(0,1.6fr)_90px_90px_100px_90px] gap-2.5";

/**
 * Their orders, newest first, from the store customers linked to them. At
 * the desk a table; on a phone (under 760px) a card per order in the Orders
 * list's own frame, so nothing hides sideways.
 */
/** The tab with nothing under its filter: what is true, in one line. */
function ordersEmpty(filter: OrderFilter) {
    return filter === "open"
        ? { title: "Nothing open", description: "Every order is done." }
        : { title: "No past orders yet" };
}

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
                    { key: "all", label: "All orders", count },
                    {
                        key: "open",
                        label: "Open",
                        count: rows.filter(isOpen).length,
                    },
                    { key: "past", label: "Past" },
                ]}
            />
            {/* The one table look: the head band, rows ruled edge to edge. */}
            <div
                data-list-table=""
                className={cn(
                    listTable.frame,
                    "overflow-x-auto max-[759px]:hidden",
                )}
            >
                <div className="min-w-[560px]">
                    <div
                        data-list-head=""
                        className={cn(COLS, listTable.head, "rounded-t-[10px]")}
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
                            className={cn(
                                COLS,
                                listTable.row,
                                "items-center text-[13px]",
                            )}
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
                                {o.total && o.currency ? (
                                    formatMoneyMajor(o.total, o.currency)
                                ) : (
                                    <AbsentValue says="Not known" />
                                )}
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
                        <EmptyState
                            size="inline"
                            className="py-3"
                            {...ordersEmpty(filter)}
                        />
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
                <EmptyState
                    size="inline"
                    className="rounded-xl border border-border bg-card p-3 min-[760px]:hidden"
                    {...ordersEmpty(filter)}
                />
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

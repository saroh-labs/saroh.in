"use client";

import { Card } from "@saroh/ui/card";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import { useSyncExternalStore } from "react";

import { formatMoment } from "@/lib/format/datetime";
import { STOCK_CHECKS_HREF, stockLogHref } from "@/lib/products/links";
import { orderRef } from "@/lib/products/overview-words";
import { signed } from "@/lib/stock/levels";
import { changeTone, weekLine } from "@/lib/stock/product-stock";
import type { StockCheck, StockLogEntry } from "@/lib/stock/service";

const noop = () => undefined;
const subscribe = () => noop;
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverZone = () => "UTC";

/** "Today, 07:12" in the viewer's zone (UTC until the browser knows). */
function useMoment() {
    const tz = useSyncExternalStore(subscribe, zone, serverZone);
    return (iso: string) => formatMoment(iso, tz);
}

/** "Counted today at 07:10 by Arjun" — the latest change, for the table's heading. */
export function LastChange({ entry }: { entry: StockLogEntry }) {
    const moment = useMoment();
    const when = moment(entry.createdAt)
        .replace(/^(Today|Yesterday)/, (d) => d.toLowerCase())
        .replace(", ", " at ");
    return (
        <>
            {entry.word} {when}
            {entry.by
                ? ` by ${entry.by.name}`
                : entry.order
                  ? ` · order ${orderRef(entry.order.number)}`
                  : ""}
        </>
    );
}

/** Stock checks about this product, above its recent changes (#523). */
export function ProductChecks({ checks }: { checks: readonly StockCheck[] }) {
    return (
        <>
            {checks.map((c) => (
                <div
                    key={c.key}
                    role="alert"
                    className="mt-3 flex flex-wrap items-baseline gap-2.5 rounded-[10px] bg-destructive-subtle px-3.5 py-[11px] text-[13px] leading-[1.5] text-destructive-subtle-foreground"
                >
                    <strong className="font-semibold">{c.title}</strong>
                    <Link
                        href={STOCK_CHECKS_HREF}
                        className="ml-auto rounded-sm font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
                    >
                        Open checks
                    </Link>
                </div>
            ))}
        </>
    );
}

const QTY_TONE = {
    ok: "text-success-subtle-foreground",
    bad: "text-destructive-subtle-foreground",
    muted: "text-muted-foreground",
} as const;

/**
 * Recent changes (#523): the product's last five stock-log entries, what
 * changed this week, and the way to the full log on the Stock screen. A
 * log that couldn't be read says so; it is never an empty week.
 */
export function RecentChanges({
    productId,
    productName,
    log,
    week,
    now,
}: {
    productId: string;
    productName: string;
    /** The latest entries; null when the log couldn't be read. */
    log: readonly StockLogEntry[] | null;
    /** This week's entries, for the summary line. */
    week: readonly StockLogEntry[] | null;
    now: Date;
}) {
    const moment = useMoment();
    return (
        <Card className="mt-3.5 rounded-[12px] p-0">
            <div className="flex flex-wrap items-center gap-2 px-[18px] pb-1.5 pt-3.5">
                <h2 className="flex-1 font-display text-[15px] font-semibold tracking-[-0.015em]">
                    Recent changes
                </h2>
                <Link
                    href={stockLogHref(productId)}
                    className="rounded-sm text-[12.5px] font-semibold text-brand hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
                >
                    See the full log
                </Link>
            </div>
            {log === null ? (
                <p
                    role="alert"
                    className="px-[18px] pb-4 text-[12.5px] text-destructive-subtle-foreground"
                >
                    Couldn&apos;t load the stock log. The numbers above are
                    still right — they come from the shelves.
                </p>
            ) : log.length === 0 ? (
                <p className="px-[18px] pb-4 text-[12.5px] text-muted-foreground">
                    No stock changes yet.
                </p>
            ) : (
                <>
                    {week ? (
                        <p className="px-[18px] pb-1 text-[12.5px] text-muted-foreground">
                            {weekLine(week, now)}
                        </p>
                    ) : null}
                    <ul className="px-[18px] pb-2 pt-1">
                        {log.map((e) => (
                            <li
                                key={e.id}
                                className="grid grid-cols-[96px_minmax(0,1fr)_40px_70px] items-baseline gap-2.5 border-t border-border py-[9px] text-[12.5px] max-sm:grid-cols-[minmax(0,1fr)_40px_64px]"
                            >
                                <span className="tabular-nums text-muted-foreground max-sm:col-span-3">
                                    {moment(e.createdAt)}
                                </span>
                                <span className="min-w-0 text-pretty text-neutral-700 dark:text-muted-foreground">
                                    <strong className="font-semibold text-foreground">
                                        {e.word}
                                    </strong>
                                    {" · "}
                                    {e.variantTitle ?? productName} ·{" "}
                                    {e.storeName}
                                    {e.order ? (
                                        <>
                                            {" · "}
                                            <Link
                                                href={`/commerce/orders/${encodeURIComponent(e.order.id)}`}
                                                className="text-brand hover:text-foreground"
                                            >
                                                Order {orderRef(e.order.number)}
                                            </Link>
                                        </>
                                    ) : e.by ? (
                                        ` · ${e.by.name}`
                                    ) : null}
                                </span>
                                <span
                                    className={cn(
                                        "text-right font-semibold tabular-nums",
                                        QTY_TONE[changeTone(e.quantity)],
                                    )}
                                >
                                    {signed(e.quantity)}
                                </span>
                                <span className="text-right tabular-nums text-muted-foreground">
                                    {e.before} → {e.after}
                                </span>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </Card>
    );
}

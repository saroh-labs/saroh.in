"use client";

import { Button } from "@saroh/ui/button";
import { Skeleton } from "@saroh/ui/skeleton";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { FailedRead } from "@/components/shared/failed-read";
import { QuickLook } from "@/components/shared/quick-look";
import { WHO_CAN_CHANGE } from "@/components/shared/who-can-change";
import { count } from "@/lib/format/plural";
import { useNarrow } from "@/lib/hooks/use-narrow";
import { ordersHref, PAID_INVOICES_HREF } from "@/lib/insights/links";
import type { SheetRead, WeekOrderRow } from "@/lib/insights/money-actions";
import { readWeekOrders } from "@/lib/insights/money-actions";
import { weekBills, weekSheetWords } from "@/lib/insights/money-words";
import type { MoneyRead, MoneyWeekRead } from "@/lib/insights/reads";

/**
 * A week's orders (DEC-171, plan U12, #1093; `IBWeekD` beside the page,
 * `IBWeekP` as a sheet on a phone): what the week took and from how many
 * payments, its days, whether it was the best, then its first paid orders
 * with "N more", and "Open these orders" for the whole list filtered to
 * those days. Its bills are named and open the paid invoices.
 *
 * The orders are read when it opens (`readWeekOrders`); a read that fails
 * says so with Try again, never "no orders".
 */
export function WeekSheet({
    week,
    open,
    read,
    onOpenChange,
}: {
    /** The week last opened; kept while the sheet closes. */
    week: MoneyWeekRead | null;
    open: boolean;
    read: Pick<MoneyRead, "currency" | "bestWeek" | "weeks">;
    onOpenChange: (open: boolean) => void;
}) {
    const narrow = useNarrow();
    if (!week) return null;
    const words = weekSheetWords(week, read);
    const all = ordersHref(week.start, week.end);
    const bills = weekBills(week);

    return (
        <QuickLook
            open={open}
            onOpenChange={onOpenChange}
            side={narrow ? "bottom" : "right"}
            title={words.title}
            subtitle="Money"
            description={`${words.big}. ${words.note}`}
            footer={
                <Button asChild variant="outline" className="coarse:min-h-11">
                    <Link href={all}>Open these orders</Link>
                </Button>
            }
        >
            <div className="grid gap-2.5" data-ph-mask="">
                <p className="font-display text-[22px] font-semibold tabular-nums tracking-[-0.02em]">
                    {words.big}
                </p>
                <p className="text-xs text-muted-foreground">{words.note}</p>
                {week.orders === 0 ? (
                    <p className="text-[13.5px]">No paid orders these days.</p>
                ) : (
                    // Mounted afresh for each week, and each time it opens.
                    <WeekOrders key={week.start} week={week} all={all} />
                )}
                {bills > 0 ? (
                    <Link href={PAID_INVOICES_HREF} className={MORE_LINK}>
                        And {count(bills, "paid invoice")}
                        <ArrowRight aria-hidden className="size-3.5" />
                    </Link>
                ) : null}
            </div>
        </QuickLook>
    );
}

const MORE_LINK =
    "inline-flex min-h-9 items-center gap-1 justify-self-start rounded-sm text-[13px] font-semibold underline decoration-border-strong underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11";

/** The week's first paid orders, read as it opens. */
function WeekOrders({ week, all }: { week: MoneyWeekRead; all: string }) {
    const [orders, setOrders] = useState<SheetRead<{
        rows: WeekOrderRow[];
        total: number;
    }> | null>(null);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let live = true;
        void readWeekOrders(week.start, week.end).then((res) => {
            if (live) setOrders(res);
        });
        return () => {
            live = false;
        };
    }, [week.start, week.end, attempt]);

    if (orders === null) {
        return (
            <ul aria-hidden className="grid gap-3 py-2">
                {[0, 1, 2].map((i) => (
                    <li key={i} className="grid gap-1.5">
                        <Skeleton className="h-3.5 w-48" />
                        <Skeleton className="h-3 w-32" />
                    </li>
                ))}
            </ul>
        );
    }
    if (!orders.ok) {
        return orders.denied ? (
            <p className="text-[13.5px] text-muted-foreground">
                Your role can&apos;t open orders. {WHO_CAN_CHANGE}
            </p>
        ) : (
            <FailedRead
                things="that week's orders"
                onRetry={() => {
                    setOrders(null);
                    setAttempt((n) => n + 1);
                }}
            />
        );
    }
    const { rows, total } = orders.data;
    return (
        <>
            <ul className="mb-1 mt-1.5" data-testid="week-orders">
                {rows.map((row) => (
                    <li
                        key={row.id}
                        className="flex items-center gap-2.5 border-t border-border py-2.5"
                    >
                        <Link
                            href={`/commerce/orders/${row.id}`}
                            className="grid min-w-0 flex-1 gap-0.5 rounded-sm text-[13.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <b className="truncate font-semibold">
                                {row.title}
                            </b>
                            <small className="truncate text-xs text-muted-foreground">
                                {row.line}
                            </small>
                        </Link>
                        {row.amount ? (
                            <span className="shrink-0 font-semibold tabular-nums">
                                {row.amount}
                            </span>
                        ) : null}
                    </li>
                ))}
            </ul>
            {total > rows.length ? (
                <Link href={all} className={MORE_LINK}>
                    {count(total - rows.length, "more order", "more orders")}
                    <ArrowRight aria-hidden className="size-3.5" />
                </Link>
            ) : null}
        </>
    );
}

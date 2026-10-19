"use client";

import { count } from "@/lib/format/plural";
import { AbsentOr } from "@saroh/ui/absent-value";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showSuccess } from "@saroh/ui/toast";
import { Download } from "lucide-react";
import { useState } from "react";

import { monthCsv, monthCsvName } from "@/lib/calendar/export";
import { LABELS, monthTitle } from "@/lib/calendar/layers";
import type { CalendarCash, StripKey } from "@/lib/calendar/money";
import { monthStrip, monthWhen, stripBreakdown } from "@/lib/calendar/money";
import type { LayerKey } from "@/lib/calendar/types";

const BREAKDOWN_ID = "calendar-money-breakdown";

interface Where {
    month: string;
    cash: CalendarCash;
    thisMonth: string;
    today: string;
    /** A shop calls its renewals subscriptions; a diary, memberships. */
    shop: boolean;
}

function useWhere({ month, cash, thisMonth, today, shop }: Where) {
    const labelOf = (layer: LayerKey) => LABELS[layer](shop).label;
    const at = {
        when: monthWhen(month, thisMonth),
        today,
        currency: cash.currency,
    };
    return { labelOf, at };
}

/**
 * The month's money, after the Calendar month boards (bookings U13, plan
 * 005 E23): In so far, Out so far, Net and Still due — and Overdue, in red,
 * when something due before today is unpaid (DEC-067). On the desk one line
 * under the title, "Export the month" at its end (BKDCalMonth); on a phone
 * a card of four (BKMOverviewMonth), with Export at the foot of the page
 * ({@link ExportMonth}). Each figure opens its breakdown by kind under it.
 * Drawn only for a caller the API sent money to (`payment:read`, DEC-098);
 * the page leaves it out otherwise.
 *
 * The figures add up what the filter leaves on; the file is the whole
 * month, whatever is switched off.
 */
export function MonthStrip(props: Where) {
    const [open, setOpen] = useState<StripKey | null>(null);
    const { labelOf, at } = useWhere(props);
    const parts = monthStrip(props.cash.shown, at);
    const breakdown = open
        ? stripBreakdown(open, props.cash.shown, { ...at, labelOf })
        : null;

    return (
        <>
            <div
                role="group"
                aria-label="This month's money"
                className={cn(
                    "flex flex-wrap items-center gap-x-[18px] gap-y-1.5 text-[13.5px] tabular-nums",
                    // A phone: a card of two by two.
                    "max-[759px]:grid max-[759px]:grid-cols-2 max-[759px]:gap-0 max-[759px]:overflow-hidden max-[759px]:rounded-xl max-[759px]:border max-[759px]:border-border max-[759px]:bg-card",
                )}
            >
                <span className="label max-[759px]:hidden">This month</span>
                {parts.map((part, i) => {
                    const on = open === part.key;
                    const last = i === parts.length - 1;
                    return (
                        <button
                            key={part.key}
                            type="button"
                            aria-expanded={on}
                            aria-controls={on ? BREAKDOWN_ID : undefined}
                            onClick={() => setOpen(on ? null : part.key)}
                            className={cn(
                                "inline-flex cursor-pointer items-baseline gap-1.5 rounded-md text-left text-foreground underline-offset-4 transition-colors duration-fast hover:underline hover:decoration-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 coarse:min-h-11 coarse:items-center",
                                on && "underline decoration-foreground",
                                "max-[759px]:grid max-[759px]:min-h-0 max-[759px]:gap-0.5 max-[759px]:rounded-none max-[759px]:border-b max-[759px]:border-border/60 max-[759px]:px-3.5 max-[759px]:py-2.5 max-[759px]:no-underline max-[759px]:focus-visible:ring-inset max-[759px]:focus-visible:ring-offset-0 max-[759px]:active:bg-accent-active",
                                i % 2 === 0 && "max-[759px]:border-r",
                                // The last row of the card has no rule under it.
                                i >= parts.length - (parts.length % 2 || 2) &&
                                    "max-[759px]:border-b-0",
                                last &&
                                    parts.length % 2 === 1 &&
                                    "max-[759px]:col-span-2 max-[759px]:border-r-0",
                                on && "max-[759px]:bg-muted",
                            )}
                        >
                            <span className="max-[759px]:label text-muted-foreground">
                                {part.label}
                            </span>
                            <strong
                                className={cn(
                                    "font-semibold",
                                    "max-[759px]:font-display max-[759px]:text-[18px] max-[759px]:tracking-[-0.02em]",
                                    part.out
                                        ? "text-destructive-subtle-foreground"
                                        : "text-foreground",
                                )}
                            >
                                <AbsentOr says="Not yet">{part.value}</AbsentOr>
                            </strong>
                        </button>
                    );
                })}
                <span aria-hidden className="flex-1 max-[759px]:hidden" />
                <ExportMonth {...props} look="link" />
            </div>
            {breakdown ? (
                <div
                    id={BREAKDOWN_ID}
                    className="!mt-2 flex flex-wrap gap-x-[18px] gap-y-1.5 rounded-[9px] bg-muted px-3 py-[9px] text-[12.5px] text-neutral-600 dark:text-muted-foreground"
                >
                    <strong className="font-semibold">{breakdown.title}</strong>
                    {breakdown.rows.map((row) => (
                        <span key={row.label}>
                            {row.label}{" "}
                            <strong className="font-semibold tabular-nums">
                                {row.value}
                            </strong>
                        </span>
                    ))}
                </div>
            ) : null}
        </>
    );
}

/**
 * "Export the month": the month's money as a spreadsheet file. The desk's
 * is a link at the end of the money line; the phone's a full-width button
 * at the foot of the page (the boards). Each is drawn only at its own
 * width, so one is ever on screen.
 */
export function ExportMonth({
    look,
    ...where
}: Where & { look: "link" | "button" }) {
    const { labelOf, at } = useWhere(where);
    const exportMonth = () => {
        const { csv, lines } = monthCsv(where.cash.all, labelOf, at);
        download(csv, monthCsvName(where.month));
        showSuccess(
            `Exported ${count(lines, "line")} for ${monthTitle(where.month)} as a spreadsheet file.`,
        );
    };
    if (look === "link") {
        return (
            <button
                type="button"
                onClick={exportMonth}
                className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-sm text-[13px] font-semibold text-foreground underline decoration-border-strong underline-offset-4 transition-colors duration-fast hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:text-muted-foreground coarse:min-h-11 max-[759px]:hidden"
            >
                <Download aria-hidden className="size-3.5" />
                Export the month
            </button>
        );
    }
    return (
        <Button
            type="button"
            variant="outline"
            onClick={exportMonth}
            className="h-12 w-full gap-2 text-[15px] min-[760px]:hidden"
        >
            <Download aria-hidden className="size-[18px]" />
            Export the month
        </Button>
    );
}

/** Hand the file to the browser, with a byte-order mark so Excel reads ₹. */
function download(csv: string, name: string) {
    const blob = new Blob(["﻿", csv], {
        type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

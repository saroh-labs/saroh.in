"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showSuccess } from "@saroh/ui/toast";
import { useState } from "react";

import { monthCsv, monthCsvName } from "@/lib/calendar/export";
import { LABELS, monthTitle } from "@/lib/calendar/layers";
import type { CalendarCash, StripKey } from "@/lib/calendar/money";
import { monthStrip, monthWhen, stripBreakdown } from "@/lib/calendar/money";
import type { LayerKey } from "@/lib/calendar/types";

const BREAKDOWN_ID = "calendar-money-breakdown";

/**
 * The month's money, after the design (plan 005 E23): In, Out, Net and Due
 * as four buttons, each opening its breakdown by kind under the row, and
 * "Export the month" at the end. Due counts from today; what was due
 * before today is a fifth, red "Overdue" when there is some (DEC-067). Drawn only for a caller the API sent money
 * to (`payment:read`); the page leaves it out otherwise.
 *
 * The strip adds up what the switches leave on; the file is the whole
 * month, whatever is switched off.
 */
export function MonthStrip({
    month,
    cash,
    thisMonth,
    today,
    shop,
}: {
    month: string;
    cash: CalendarCash;
    thisMonth: string;
    today: string;
    /** A shop calls its renewals subscriptions; a diary, memberships. */
    shop: boolean;
}) {
    const [open, setOpen] = useState<StripKey | null>(null);
    const labelOf = (layer: LayerKey) => LABELS[layer](shop).label;
    const at = {
        when: monthWhen(month, thisMonth),
        today,
        currency: cash.currency,
    };
    const parts = monthStrip(cash.shown, at);
    const breakdown = open
        ? stripBreakdown(open, cash.shown, { ...at, labelOf })
        : null;

    const exportMonth = () => {
        const { csv, lines } = monthCsv(cash.all, labelOf, at);
        download(csv, monthCsvName(month));
        showSuccess(
            `Exported ${lines} ${lines === 1 ? "line" : "lines"} for ${monthTitle(month)} as a spreadsheet file.`,
        );
    };

    return (
        <>
            <div
                role="group"
                aria-label="This month's money"
                className="!mt-2.5 flex flex-wrap gap-2"
            >
                {parts.map((part) => {
                    const on = open === part.key;
                    return (
                        <button
                            key={part.key}
                            type="button"
                            aria-expanded={on}
                            aria-controls={on ? BREAKDOWN_ID : undefined}
                            onClick={() => setOpen(on ? null : part.key)}
                            className={cn(
                                "grid min-w-[118px] cursor-pointer gap-0.5 rounded-[10px] border bg-card px-[13px] py-[9px] text-left text-foreground transition-[background-color,border-color] duration-fast hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-accent-active",
                                on
                                    ? "border-foreground"
                                    : "border-border hover:border-border-strong",
                            )}
                        >
                            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                {part.label}
                            </span>
                            <span
                                className={cn(
                                    "font-display text-[18px] font-semibold tabular-nums tracking-[-0.02em]",
                                    part.out
                                        ? "text-destructive-subtle-foreground"
                                        : "text-foreground",
                                )}
                            >
                                {part.value}
                            </span>
                        </button>
                    );
                })}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={exportMonth}
                    className="ml-auto self-center px-3 text-[12.5px]"
                >
                    Export the month
                </Button>
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

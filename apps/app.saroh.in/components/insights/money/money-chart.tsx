"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { ArrowRight } from "lucide-react";
import { useState } from "react";

import type { MoneyWeekBar } from "@/lib/insights/money-words";
import type { MoneyChart as Chart } from "@/lib/insights/overview-words";
import type { MoneyRead } from "@/lib/insights/reads";

import { WeekSheet } from "./week-sheet";

/**
 * "Am I making more money?"'s chart on the Money tab (DEC-171, plan U12,
 * #1093; `IBMoneyD`, `IBWeekD`, `IBMoneyP`, `IBWeekP`): rolling weeks
 * ending today, the period dark, the one before light, earlier faint, the
 * best week in Clay with its amount over it, three dashed lines of scale,
 * four dates under, the legend.
 *
 * Every bar is a button. Pointing at it or focusing it puts its week in
 * the readout above the chart ("Week of 12 Oct · ₹50,100 · 78 payments"),
 * so nothing lives only in a hover and a screen reader hears each week as
 * the bar's name; choosing it (a tap, a click, Enter) opens that week's
 * orders beside the page, or as a sheet on a phone. The readout's "Orders
 * that week" opens the same for the bar it shows.
 */
export function MoneyChart({
    bars,
    chart,
    initial,
    read,
    note,
}: {
    bars: readonly MoneyWeekBar[];
    chart: Chart;
    /** The bar the readout starts on: the best week. */
    initial: string | null;
    read: Pick<MoneyRead, "currency" | "bestWeek" | "weeks">;
    /** Under the legend: the other-currency note. */
    note?: string | null;
}) {
    const [selected, setSelected] = useState(initial);
    const [open, setOpen] = useState(false);
    // The week last opened stays while the sheet closes.
    const [opened, setOpened] = useState<MoneyWeekBar | null>(null);
    const shown = bars.find((b) => b.key === selected) ?? bars.at(-1);
    const openWeek = (bar: MoneyWeekBar) => {
        setOpened(bar);
        setOpen(true);
    };
    const best = bars.find((b) => b.best);
    const many = bars.length > 14;

    return (
        <div className="grid w-full gap-1.5" data-ph-mask="">
            <div
                aria-live="polite"
                className="flex w-full flex-wrap items-center justify-between gap-1.5 text-[13px] font-medium tabular-nums"
            >
                <span data-testid="money-readout">{shown?.readout}</span>
                {shown ? (
                    <Button
                        type="button"
                        variant="link"
                        size="inline"
                        onClick={() => openWeek(shown)}
                        className="min-h-9 gap-1 font-semibold coarse:min-h-11"
                    >
                        Orders that week
                        <ArrowRight aria-hidden className="size-3.5" />
                    </Button>
                ) : null}
            </div>
            <div className="relative mt-5 h-[150px] w-full desk:h-[200px]">
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 flex flex-col justify-between"
                >
                    {chart.grid.map((line, i) => (
                        <span
                            key={i}
                            className="block border-t border-dashed border-border pt-0.5 text-right text-[10.5px] leading-none text-muted-foreground"
                        >
                            {line}
                        </span>
                    ))}
                </div>
                <div
                    role="group"
                    aria-label={`${chart.label} Choose a week to open its orders.`}
                    className={cn(
                        "absolute inset-0 flex items-end pr-[30px] desk:pr-[34px]",
                        many
                            ? "gap-px desk:gap-[3px]"
                            : "gap-[3px] desk:gap-[5px]",
                    )}
                >
                    {bars.map((bar) => {
                        const active = bar.key === shown?.key;
                        return (
                            <button
                                key={bar.key}
                                type="button"
                                aria-label={bar.label}
                                aria-pressed={active}
                                data-tone={bar.tone}
                                data-best={bar.best || undefined}
                                onClick={() => {
                                    setSelected(bar.key);
                                    openWeek(bar);
                                }}
                                onFocus={() => setSelected(bar.key)}
                                onPointerEnter={(e) => {
                                    if (e.pointerType === "mouse") {
                                        setSelected(bar.key);
                                    }
                                }}
                                className="group flex h-full min-w-0 flex-1 cursor-pointer items-end rounded-t-[4px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            >
                                <span
                                    aria-hidden
                                    className={cn(
                                        "relative block w-full rounded-t-[4px] transition-opacity duration-base",
                                        bar.best ? BEST : TONE[bar.tone],
                                        bar.heightPercent <= 0 && "bg-border",
                                        !active && "group-hover:opacity-80",
                                        active &&
                                            "outline outline-2 outline-offset-2 outline-foreground/30",
                                    )}
                                    style={{
                                        height:
                                            bar.heightPercent > 0
                                                ? `${Math.max(bar.heightPercent, 1)}%`
                                                : "2px",
                                    }}
                                >
                                    {bar === best ? (
                                        <span className="absolute -top-[19px] left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-foreground">
                                            {bar.short}
                                        </span>
                                    ) : null}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
            <div
                aria-hidden
                className="flex justify-between pr-[30px] text-[11.5px] text-muted-foreground desk:pr-[34px]"
            >
                {bars
                    .filter((b) => b.tick)
                    .map((b) => (
                        <span key={b.key}>{b.tick}</span>
                    ))}
            </div>
            {chart.legend.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-700 dark:text-muted-foreground">
                    {chart.legend.map((item, i) => (
                        <span
                            key={item.tone}
                            className="inline-flex items-center gap-1.5"
                        >
                            <span
                                aria-hidden
                                className={cn(
                                    "inline-block size-2.5 rounded-[2px]",
                                    i > 0 && "ml-2",
                                    TONE[item.tone],
                                )}
                            />
                            {item.label}
                        </span>
                    ))}
                </div>
            ) : null}
            {note ? (
                <p
                    data-testid="money-other-currency"
                    className="text-xs leading-[1.5] text-muted-foreground"
                >
                    {note}
                </p>
            ) : null}
            <WeekSheet
                week={opened?.week ?? null}
                open={open}
                read={read}
                onOpenChange={setOpen}
            />
        </div>
    );
}

const TONE: Record<MoneyWeekBar["tone"], string> = {
    now: "bg-foreground",
    before: "bg-neutral-300 dark:bg-neutral-500",
    old: "bg-neutral-200 dark:bg-neutral-700",
};

const BEST = "bg-brand";

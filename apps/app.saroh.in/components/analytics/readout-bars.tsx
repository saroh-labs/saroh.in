"use client";

import { cn } from "@saroh/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/**
 * Insights' bar charts (DEC-075, audit F2, F3, F6): the takings' weeks and
 * the website's days, drawn the same way. Every bar is a button: pointing
 * at it, focusing it or tapping it puts its value in the readout above the
 * chart, with a link to the rows behind it where there are rows — so no
 * value lives only in a hover, a phone reads a bar before it leaves the
 * page, and a screen reader hears each bar's value as its name. The
 * readout starts on the bar the caller picks (the marked one).
 */

export interface ReadoutBar {
    key: string;
    /** 0–100 of the chart's height. */
    heightPercent: number;
    /** The classes that paint it. */
    tone: string;
    /** "Week of 14 Sep · ₹3,39,532 · 41 paid orders". */
    readout: string;
    link?: { href: string; label: string };
    /** Set apart from the bars before it (the week in progress). */
    apart?: boolean;
    /** The axis label under it, if it carries one. */
    tick?: string;
    /** Its label is left off on a phone, where fewer fit. */
    tickWide?: boolean;
}

export function ReadoutBars({
    bars,
    label,
    initial,
    tall = false,
}: {
    bars: readonly ReadoutBar[];
    /** What the chart shows, for the group. */
    label: string;
    /** The bar the readout starts on. */
    initial: string;
    /** 160px rather than 96px from the md breakpoint. */
    tall?: boolean;
}) {
    const [selected, setSelected] = useState(initial);
    const shown = bars.find((b) => b.key === selected) ?? bars.at(-1);
    const last = bars.length - 1;

    return (
        <div>
            <div
                aria-live="polite"
                className="mb-2.5 flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1"
            >
                <p className="text-[13px] font-medium tabular-nums">
                    {shown?.readout}
                </p>
                {shown?.link ? (
                    <Link
                        href={shown.link.href}
                        className="inline-flex min-h-11 items-center gap-0.5 rounded-md text-[13px] font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {shown.link.label}
                        <ChevronRight aria-hidden className="size-4" />
                    </Link>
                ) : null}
            </div>
            <div
                role="group"
                aria-label={label}
                className={cn(
                    "flex items-end gap-[3px] sm:gap-[5px]",
                    tall ? "h-24 md:h-40" : "h-24",
                )}
            >
                {bars.map((bar) => {
                    const active = bar.key === shown?.key;
                    return (
                        <button
                            key={bar.key}
                            type="button"
                            aria-label={bar.readout}
                            aria-pressed={active}
                            onClick={() => setSelected(bar.key)}
                            onFocus={() => setSelected(bar.key)}
                            onPointerEnter={(e) => {
                                if (e.pointerType === "mouse") {
                                    setSelected(bar.key);
                                }
                            }}
                            className={cn(
                                "group flex h-full min-w-0 flex-1 items-end rounded-t-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                bar.apart && "ml-1.5 sm:ml-2.5",
                            )}
                        >
                            <span
                                aria-hidden
                                className={cn(
                                    "ease-[cubic-bezier(0.25,1,0.5,1)] block min-h-[3px] w-full rounded-t-[3px] transition-opacity duration-150",
                                    bar.tone,
                                    !active && "group-hover:opacity-80",
                                    active &&
                                        "outline outline-2 outline-offset-2 outline-foreground/30",
                                )}
                                style={{ height: `${bar.heightPercent}%` }}
                            />
                        </button>
                    );
                })}
            </div>
            <div
                aria-hidden
                className="mt-[7px] flex gap-[3px] text-xs text-muted-foreground sm:gap-[5px]"
            >
                {bars.map((bar, i) => (
                    <span
                        key={bar.key}
                        className={cn(
                            "relative h-4 min-w-0 flex-1",
                            bar.apart && "ml-1.5 sm:ml-2.5",
                        )}
                    >
                        {bar.tick ? (
                            <span
                                className={cn(
                                    "absolute top-0 whitespace-nowrap",
                                    i === 0
                                        ? "left-0"
                                        : i === last
                                          ? "right-0"
                                          : "left-1/2 -translate-x-1/2",
                                    bar.tickWide && "max-sm:hidden",
                                )}
                            >
                                {bar.tick}
                            </span>
                        ) : null}
                    </span>
                ))}
            </div>
        </div>
    );
}

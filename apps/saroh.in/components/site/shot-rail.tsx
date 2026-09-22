"use client";

import { cn } from "@saroh/ui/lib/utils";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { JobIcon } from "@/components/site/job-icon";
import { ThemedImage } from "@/components/site/themed-image";
import type { IconName, ThemedImage as Pair } from "@/lib/site-content";

export interface RailItem {
    key: string;
    /** The short name in the list on the left. */
    label: string;
    icon?: IconName;
    /** The headline and sentence under the picture. */
    title: string;
    body: string;
    image: Pair;
    alt: string;
    /** Where the item leads, when it is a page of its own. */
    href?: string;
    more?: string;
}

/**
 * The design's rail: every item readable at once down the left, and the chosen
 * one's real screen, headline and sentence on the right. Arrows step through;
 * the position is announced. Home uses it for the five jobs, each job page for
 * its four features — the same object, so the two can never drift.
 */
export function ShotRail({
    items,
    label,
}: {
    items: RailItem[];
    /** What the list is, for a screen reader: "Jobs", "What Sell does". */
    label: string;
}) {
    const [index, setIndex] = useState(0);
    const item = items[index];
    const step = (d: number) =>
        setIndex((i) => (i + d + items.length) % items.length);
    const prev = items[(index - 1 + items.length) % items.length];
    const next = items[(index + 1) % items.length];

    return (
        <div className="grid gap-[18px] min-[1100px]:grid-cols-[232px_1fr] min-[1100px]:gap-[26px]">
            <div>
                <div
                    role="group"
                    aria-label={label}
                    className="flex flex-row flex-wrap gap-[7px] min-[1100px]:flex-col min-[1100px]:gap-px"
                >
                    {items.map((it, i) => (
                        <button
                            key={it.key}
                            type="button"
                            aria-pressed={i === index}
                            onClick={() => setIndex(i)}
                            className={cn(
                                "flex items-center gap-[9px] rounded-[9px] border px-[11px] py-2 text-left min-[1100px]:w-full",
                                it.icon ? "text-[16px]" : "text-[15px]",
                                // One weight in both states: the card and the
                                // ink say which is chosen, so nothing reflows
                                // as the selection moves.
                                "font-normal",
                                i === index
                                    ? "border-border bg-card text-foreground shadow-[0_1px_2px_rgba(28,28,26,0.06)]"
                                    : "border-transparent text-highlight-600 hover:text-foreground dark:text-highlight-400",
                            )}
                        >
                            {it.icon ? (
                                <span className="grid size-7 shrink-0 place-items-center">
                                    <JobIcon
                                        name={it.icon}
                                        className="size-[15px]"
                                    />
                                </span>
                            ) : (
                                <span className="grid size-6 shrink-0 place-items-center font-mono text-[11px] text-muted-foreground">
                                    {String(i + 1).padStart(2, "0")}
                                </span>
                            )}
                            <span className="min-w-0 flex-1 text-pretty">
                                {it.label}
                            </span>
                        </button>
                    ))}
                </div>
                <div className="mt-5 flex gap-[7px]">
                    <button
                        type="button"
                        onClick={() => step(-1)}
                        aria-label={`Previous — ${prev.label}`}
                        className="grid size-[30px] place-items-center rounded-full border border-border bg-card text-highlight-600 hover:bg-muted dark:text-highlight-400"
                    >
                        <ChevronLeft aria-hidden className="size-[15px]" />
                    </button>
                    <button
                        type="button"
                        onClick={() => step(1)}
                        aria-label={`Next — ${next.label}`}
                        className="grid size-[30px] place-items-center rounded-full border border-border bg-card text-highlight-600 hover:bg-muted dark:text-highlight-400"
                    >
                        <ChevronRight aria-hidden className="size-[15px]" />
                    </button>
                    <span
                        role="status"
                        aria-live="polite"
                        className="ml-1 self-center font-mono text-[11.5px] text-muted-foreground"
                    >
                        {index + 1} / {items.length}
                    </span>
                </div>
            </div>

            <div className="relative overflow-hidden rounded-[16px] border border-border bg-card pb-5 pl-5 pt-[22px] sm:pl-[22px]">
                {item.href ? (
                    <Link
                        href={item.href}
                        aria-label={`Open ${item.label}`}
                        className="absolute right-3.5 top-3.5 z-10 grid size-[30px] place-items-center rounded-full border border-border bg-card text-highlight-600 hover:bg-muted dark:text-highlight-400"
                    >
                        <ArrowUpRight aria-hidden className="size-[13px]" />
                    </Link>
                ) : null}
                {/* The well is as tall as the detail, so none leaves dead
                    space; wider than the card, it scrolls sideways. */}
                <div
                    className="overflow-x-auto overflow-y-hidden"
                    style={{ maxWidth: item.image.w }}
                >
                    <ThemedImage
                        key={item.key}
                        image={item.image}
                        alt={item.alt}
                        className="max-w-none rounded-tl-[10px] shadow-[0_10px_30px_rgba(28,28,26,0.16)]"
                    />
                </div>
                <div className="pr-[22px] pt-5">
                    <div className="font-display text-[19px] font-semibold tracking-[-0.025em]">
                        {item.title}
                    </div>
                    <p className="mt-[5px] max-w-[62ch] text-pretty text-[15px] leading-[1.6] text-highlight-600 dark:text-highlight-400">
                        {item.body}
                    </p>
                    {item.href && item.more ? (
                        <Link
                            href={item.href}
                            className="mt-[13px] inline-flex h-9 items-center rounded-[9px] border border-border bg-card px-3.5 text-[13.5px] font-semibold hover:bg-muted"
                        >
                            {item.more}
                        </Link>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

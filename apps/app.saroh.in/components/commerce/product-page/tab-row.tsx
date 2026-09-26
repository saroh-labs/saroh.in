"use client";

import { cn } from "@saroh/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ProductTab } from "@/lib/products/links";

export interface TabItem {
    id: ProductTab;
    label: string;
    href: string;
    badge?: { text: string; tone: "plain" | "attention" | "danger" };
}

/**
 * The tab row, scrolling sideways when it doesn't fit (a phone, a narrow
 * window). Fades say there is more: on the left once scrolled, and on the
 * right a button that shows the rest — a tap target, not a hover hint. The
 * current tab scrolls into view when the page opens on it.
 */
export function TabRow({
    tabs,
    active,
}: {
    tabs: readonly TabItem[];
    active: ProductTab;
}) {
    const row = useRef<HTMLElement>(null);
    const [fade, setFade] = useState({ left: false, right: false });

    const measure = useCallback(() => {
        const el = row.current;
        if (!el) return;
        const left = el.scrollLeft > 4;
        const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
        setFade((f) =>
            f.left === left && f.right === right ? f : { left, right },
        );
    }, []);

    useEffect(() => {
        const el = row.current;
        const on = el?.querySelector<HTMLElement>('[aria-current="page"]');
        if (el && on) {
            const start = on.offsetLeft - 22;
            const end = on.offsetLeft + on.offsetWidth - el.clientWidth + 52;
            if (start < el.scrollLeft) el.scrollLeft = start;
            else if (end > el.scrollLeft) el.scrollLeft = end;
        }
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, [active, measure]);

    return (
        <div className="relative border-b border-border">
            <nav
                ref={row}
                aria-label="Product sections"
                onScroll={measure}
                className="flex gap-0.5 overflow-x-auto px-4 pt-1.5 [scrollbar-width:none] sm:px-[22px] [&::-webkit-scrollbar]:hidden"
            >
                {tabs.map((t) => {
                    const on = t.id === active;
                    return (
                        <Link
                            key={t.id}
                            id={`tab-${t.id}`}
                            href={t.href}
                            scroll={false}
                            aria-current={on ? "page" : undefined}
                            className={cn(
                                "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-[13px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring coarse:min-h-11",
                                on
                                    ? "font-semibold text-foreground shadow-[inset_0_-2px_0_hsl(var(--brand))]"
                                    : "font-medium text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {t.label}
                            {t.badge ? (
                                <span
                                    className={cn(
                                        "whitespace-nowrap rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums",
                                        t.badge.tone === "attention" &&
                                            "bg-brand-subtle text-brand-subtle-foreground",
                                        t.badge.tone === "danger" &&
                                            "bg-destructive-subtle text-destructive-subtle-foreground",
                                        t.badge.tone === "plain" &&
                                            "bg-muted text-muted-foreground",
                                    )}
                                >
                                    {t.badge.text}
                                </span>
                            ) : null}
                        </Link>
                    );
                })}
            </nav>
            {fade.left ? (
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-l from-transparent to-card to-70% dark:to-background"
                />
            ) : null}
            {fade.right ? (
                <button
                    type="button"
                    aria-label="More sections"
                    onClick={() => {
                        const el = row.current;
                        if (el) el.scrollLeft = el.scrollWidth;
                        measure();
                    }}
                    className="absolute bottom-px right-0 top-0 flex w-[52px] items-center justify-end bg-gradient-to-r from-transparent to-card to-55% pr-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:to-background"
                >
                    <ChevronRight
                        aria-hidden
                        className="size-3.5 text-neutral-700 dark:text-muted-foreground"
                        strokeWidth={2.2}
                    />
                </button>
            ) : null}
        </div>
    );
}

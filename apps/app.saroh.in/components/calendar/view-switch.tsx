"use client";

import { cn } from "@saroh/ui/lib/utils";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";

export type CalendarView = "month" | "week";

const VIEWS: { view: CalendarView; label: string }[] = [
    { view: "month", label: "Month" },
    { view: "week", label: "Week" },
];

/**
 * Month | Week (plan 005 E25), after the design: a two-way segmented switch
 * beside ‹ This month ›. Each view is its own address, so a switch opens it
 * — the week holding the day picked, or that day's month. A radio group:
 * one tab stop, and the arrows move between the two.
 */
export function ViewSwitch({
    view,
    hrefs,
}: {
    view: CalendarView;
    hrefs: Record<CalendarView, string>;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const refs = useRef<Partial<Record<CalendarView, HTMLButtonElement>>>({});

    const open = (to: CalendarView) => {
        if (to === view) return;
        start(() => router.push(hrefs[to], { scroll: false }));
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const step = {
            ArrowLeft: -1,
            ArrowUp: -1,
            ArrowRight: 1,
            ArrowDown: 1,
        }[e.key];
        if (!step) return;
        e.preventDefault();
        const at = VIEWS.findIndex((v) => v.view === view);
        const to = VIEWS[(at + step + VIEWS.length) % VIEWS.length].view;
        refs.current[to]?.focus();
        open(to);
    };

    return (
        <div
            role="radiogroup"
            aria-label="View"
            aria-busy={pending || undefined}
            onKeyDown={onKeyDown}
            className="ml-1.5 flex gap-0.5 rounded-[9px] bg-muted p-[3px]"
        >
            {VIEWS.map(({ view: v, label }) => {
                const on = v === view;
                return (
                    <button
                        key={v}
                        ref={(el) => {
                            if (el) refs.current[v] = el;
                        }}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        tabIndex={on ? 0 : -1}
                        onClick={() => open(v)}
                        className={cn(
                            "cursor-pointer rounded-[7px] px-[11px] py-1.5 font-sans text-[12.5px] font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11",
                            on
                                ? "bg-card text-foreground shadow-sm"
                                : "bg-transparent text-muted-foreground hover:bg-card/60 hover:text-foreground active:bg-card/90",
                        )}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}

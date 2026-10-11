"use client";

import { Segmented } from "@saroh/ui/segmented";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export type CalendarView = "month" | "week";

const VIEWS: { value: CalendarView; label: string }[] = [
    { value: "month", label: "Month" },
    { value: "week", label: "Week" },
];

/**
 * Month | Week (plan 005 E25), after the design: a two-way segmented switch
 * beside ‹ This month ›. Each view is its own address, so a switch opens it
 * (the week holding the day picked, or that day's month). A radio group:
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
    const [, start] = useTransition();

    const open = (to: CalendarView) => {
        if (to === view) return;
        start(() => router.push(hrefs[to], { scroll: false }));
    };

    return (
        <Segmented
            label="View"
            className="ml-1.5"
            value={view}
            onValueChange={open}
            options={VIEWS}
        />
    );
}

"use client";

import { formatDay } from "@/lib/format/datetime";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import { PageHeader } from "@saroh/ui/page-header";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

import type { CalendarLayout } from "@/lib/services/calendar-href";
import { calendarHref } from "@/lib/services/calendar-href";
import type { LocalDate } from "@/lib/services/diary";
import { addDays, weekStartOf } from "@/lib/services/diary";
import type { LegendKey } from "@/lib/services/diary-view";

import { SwitchRow } from "@/components/shared/check-row";

import { BookingsViewSwitch } from "../bookings-view-switch";
import { CLOSED_HATCH, OFF_HATCH } from "./geometry";

const STEP =
    "flex h-8 items-center justify-center rounded-[8px] border border-border bg-card text-foreground transition-colors duration-fast hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-accent-active coarse:h-11";

/**
 * The calendar's one row, drawn with the page header: back and forward and
 * the date (the page's heading) on the left with the day's count quiet
 * beside it; the view switch and New booking on the right. On a phone it
 * wraps to two short rows, so the diary starts as high as it can.
 *
 * Back and forward keep their place whatever the day: Today comes after
 * them, and only when the day shown is not today.
 */
export function CalendarToolbar({
    layout,
    date,
    today,
    summary,
    cancelled,
    newBooking,
}: {
    layout: CalendarLayout;
    date: LocalDate;
    today: LocalDate;
    /** "2 bookings · ₹1,000 booked". */
    summary: string;
    /** Cancelled bookings on the view: how many, and whether they are drawn. */
    cancelled: {
        count: number;
        shown: boolean;
        onChange: (on: boolean) => void;
    };
    newBooking: ReactNode;
}) {
    const step = layout === "week" ? 7 : 1;
    const unit = layout === "week" ? "week" : "day";
    const to = (d: LocalDate) =>
        calendarHref(layout, d, { cancelled: cancelled.shown });
    const heading =
        layout === "week"
            ? `Week of ${formatDay(weekStartOf(date), { year: "never" })}`
            : `${formatDay(date, { weekday: "short", year: "never" })}${date === today ? " · today" : ""}`;

    return (
        <PageHeader
            holdsData={false}
            className="mb-3"
            breadcrumb={["Bookings", "Calendar"]}
            lead={
                <div className="flex gap-1">
                    <Link
                        href={to(addDays(date, -step))}
                        scroll={false}
                        aria-label={`Previous ${unit}`}
                        className={cn(STEP, "w-8 coarse:w-11")}
                    >
                        <ChevronLeft aria-hidden className="size-4" />
                    </Link>
                    <Link
                        href={to(addDays(date, step))}
                        scroll={false}
                        aria-label={`Next ${unit}`}
                        className={cn(STEP, "w-8 coarse:w-11")}
                    >
                        <ChevronRight aria-hidden className="size-4" />
                    </Link>
                    {date === today ? null : (
                        <Link
                            href={to(today)}
                            scroll={false}
                            className={cn(
                                STEP,
                                "px-[11px] text-[12.5px] font-semibold",
                            )}
                        >
                            Today
                        </Link>
                    )}
                </div>
            }
            title={
                // Beside the steppers the date has less room than a title
                // alone, so it is smaller until the desk is wide.
                <span className="max-[1099px]:text-[22px]">{heading}</span>
            }
            badge={
                <>
                    <span
                        role="status"
                        className="text-[12.5px] tabular-nums text-muted-foreground"
                    >
                        {summary}
                    </span>
                    {cancelled.count > 0 ? (
                        // On, they are drawn as thin struck lines. The
                        // words take the press too (`SwitchRow`).
                        <SwitchRow
                            side="start"
                            checked={cancelled.shown}
                            onChange={cancelled.onChange}
                            name={`Show ${cancelled.count} cancelled`}
                            className="gap-1.5 text-[12.5px] tabular-nums text-muted-foreground"
                        >
                            {cancelled.count} cancelled
                        </SwitchRow>
                    ) : null}
                </>
            }
            meta={
                <BookingsViewSwitch
                    current={layout}
                    date={date}
                    cancelled={cancelled.shown}
                />
            }
            actions={newBooking}
        />
    );
}

const SWATCH = "inline-block h-3 w-5 shrink-0 rounded-[3px]";

const LEGEND: Record<LegendKey, { label: string; swatch: string }> = {
    one: { label: "One-to-one", swatch: "bg-diary-one" },
    class: { label: "Class", swatch: "bg-diary-class" },
    closed: {
        label: "Closed",
        swatch: cn("border border-border", CLOSED_HATCH),
    },
    off: { label: "Time off", swatch: cn("border border-border", OFF_HATCH) },
    cancelled: {
        label: "Cancelled",
        swatch: "relative border border-border bg-card after:absolute after:inset-x-0.5 after:top-1/2 after:h-px after:bg-muted-foreground after:content-['']",
    },
};

/**
 * The key to the view, naming only what is drawn on it (`legendOf`). With
 * nothing but bookings on the page there is nothing to tell apart, so there
 * is no legend at all.
 */
export function Legend({ keys }: { keys: readonly LegendKey[] }) {
    if (keys.length === 0) return null;
    return (
        <ul
            aria-label="Key"
            className="mb-3 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[11.5px] text-muted-foreground"
        >
            {keys.map((k) => (
                <li key={k} className="inline-flex items-center gap-1.5">
                    <span
                        aria-hidden
                        className={cn(SWATCH, LEGEND[k].swatch)}
                    />
                    {LEGEND[k].label}
                </li>
            ))}
        </ul>
    );
}

// ── The one-time hint ───────────────────────────────────────────────────────

const HINT_KEY = "saroh:bookings:service-hours-hint";
const listeners = new Set<() => void>();
// Kept here too, so the hint stays away for the visit when the browser
// refuses storage (a private window, blocked site data).
let dismissedHere = false;

function wasDismissed(): boolean {
    if (dismissedHere) return true;
    try {
        return window.localStorage.getItem(HINT_KEY) === "1";
    } catch {
        return false;
    }
}

function dismissHint() {
    dismissedHere = true;
    try {
        window.localStorage.setItem(HINT_KEY, "1");
    } catch {
        // Storage is full or blocked: it is gone for this visit all the same.
    }
    listeners.forEach((l) => l());
}

function subscribeHint(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/**
 * With nobody on the diary: how the one column works, said once. "Got it"
 * puts it away for good in this browser. The server never draws it (it
 * cannot know), so someone who dismissed it never sees it flash back; "Add
 * who takes bookings" stays at the head of the column either way.
 */
export function ServiceHoursHint({ onAdd }: { onAdd?: () => void }) {
    const dismissed = useSyncExternalStore(
        subscribeHint,
        wasDismissed,
        () => true,
    );
    if (dismissed) return null;
    return (
        <Notice
            tone="neutral"
            align="center"
            className="mb-3"
            action={
                <Button variant="outline" size="sm" onClick={dismissHint}>
                    Got it
                </Button>
            }
        >
            Customers book each service in its own hours. Hatched time is
            closed, and the rest is open to book.{" "}
            {onAdd ? (
                // Words, not a second control: the action is at the head of
                // the column just below, at a size a thumb can press.
                <>
                    To give each person a column of their own, press “Add who
                    takes bookings” under Service hours.
                </>
            ) : null}
        </Notice>
    );
}

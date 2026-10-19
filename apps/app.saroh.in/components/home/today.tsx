"use client";

import { clockValue, formatClock } from "@/lib/format/datetime";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showError } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useId, useMemo, useState } from "react";

import { useHold } from "@/components/shared/use-hold";
import type { HomeToday, HomeTodayItem } from "@/lib/home/service";
import type { TodayRow } from "@/lib/home/today";
import { todayView } from "@/lib/home/today";
import { recordBookingOutcome } from "@/lib/services/actions";
import { BOOKING_WORDS } from "@/lib/services/booking-words";
import { EmptyState } from "@saroh/ui/data-state";
import { TextLink } from "@saroh/ui/text-link";

type Outcome = "ATTENDED" | "NO_SHOW";
type Marked = Pick<HomeTodayItem, "outcome" | "outcomeTime">;

/**
 * Today, as the Home design draws it (round 2, F5): the business's day in
 * time order, beside the work. The last ninety minutes stay to be marked,
 * then the next five; the rest of the day and every later one are the
 * calendar's ("Open the calendar").
 *
 * Arrived and No-show write the booking's own outcome (#241) for someone
 * who holds `booking:write`, and are held for Undo first, as the calendar
 * holds them (`useHold`): the row reads "Arrived 09:32" at once, and Undo
 * drops it before anything is written. Without `booking:write` the states
 * show and nothing can be marked. A refusal (a booking cancelled meanwhile)
 * puts the row back and says why.
 */
export function Today({ today, now }: { today: HomeToday; now: string }) {
    const headingId = useId();
    const router = useRouter();
    const { hold } = useHold();
    const [marked, setMarked] = useState<Partial<Record<string, Marked>>>({});

    const view = useMemo(() => {
        const items = today.items.map((item) => {
            const held = marked[item.id];
            return held ? { ...item, ...held } : item;
        });
        return todayView({ ...today, items }, new Date(now));
    }, [today, marked, now]);

    if (!view.visible) return null;

    const put = (id: string, next: Marked | null) =>
        setMarked((all) => {
            const out = { ...all };
            if (next) out[id] = next;
            else delete out[id];
            return out;
        });

    const mark = (row: TodayRow, outcome: Outcome) => {
        const was = marked[row.id] ?? null;
        put(row.id, {
            outcome,
            outcomeTime:
                outcome === "ATTENDED"
                    ? clockValue(new Date(), today.zone)
                    : null,
        });
        const who = row.person?.split(" ")[0] ?? "They";
        hold(
            `home-outcome:${row.id}`,
            outcome === "ATTENDED"
                ? `${who} arrived.`
                : `Marked ${who} as didn't come.`,
            async () => {
                const res = await recordBookingOutcome(row.id, outcome);
                if (!res.ok) {
                    showError(res.error);
                    put(row.id, was);
                }
                router.refresh();
            },
            () => put(row.id, was),
        );
    };

    return (
        <section aria-labelledby={headingId} className="grid min-w-0 gap-[9px]">
            <div className="flex flex-wrap items-baseline gap-[9px]">
                <h2 id={headingId} className="label">
                    Today
                </h2>
                <span className="text-[12.5px] text-muted-foreground">
                    {view.count}
                </span>
                <TextLink
                    href={today.bookings ? "/bookings" : "/commerce/orders"}
                    className="ml-auto text-[12.5px]"
                >
                    {today.bookings ? "Open the calendar" : "All orders"}
                </TextLink>
            </div>

            <ul className="overflow-hidden rounded-xl border border-border bg-card">
                {view.empty ? (
                    <li className="px-4 py-3.5">
                        <EmptyState
                            size="inline"
                            title="Nothing booked today."
                        />
                    </li>
                ) : null}
                {view.rows.map((row, i) => (
                    <TodayLine
                        key={row.id}
                        row={row}
                        first={i === 0}
                        onMark={(outcome) => mark(row, outcome)}
                    />
                ))}
            </ul>
        </section>
    );
}

function TodayLine({
    row,
    first,
    onMark,
}: {
    row: TodayRow;
    first: boolean;
    onMark: (outcome: Outcome) => void;
}) {
    const marks = row.canArrive || row.canNoShow;
    return (
        <li
            className={cn(
                // The whole row is the link (its title's overlay), as the
                // design draws it; the marks sit above that overlay.
                "relative grid grid-cols-[84px_minmax(0,1fr)_auto] items-start gap-3 px-4 py-3 transition-colors duration-fast hover:bg-muted/60 active:bg-muted",
                !first && "border-t border-border",
            )}
        >
            <span
                className={cn(
                    // "12:30 pm" stays on one line in its 84px column.
                    "whitespace-nowrap font-display text-[15px] font-semibold tabular-nums",
                    first ? "text-foreground" : "text-foreground",
                )}
            >
                {formatClock(row.time)}
            </span>
            <span className="grid min-w-0 gap-0.5">
                <Link
                    href={row.href}
                    className="text-sm font-medium text-foreground after:absolute after:inset-0 after:rounded-none focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                >
                    {row.what}
                </Link>
                {row.who ? (
                    <span className="text-[12.5px] text-muted-foreground">
                        {row.who}
                    </span>
                ) : null}
                {row.flags.map((flag) => (
                    <Badge
                        key={flag}
                        variant="error"
                        size="sm"
                        className="mt-[3px] justify-self-start"
                    >
                        {flag}
                    </Badge>
                ))}
                {marks ? (
                    <span className="relative z-10 mt-2 flex flex-wrap gap-2">
                        {row.canArrive ? (
                            <MarkButton onClick={() => onMark("ATTENDED")}>
                                {BOOKING_WORDS.markArrived}
                            </MarkButton>
                        ) : null}
                        {row.canNoShow ? (
                            <MarkButton onClick={() => onMark("NO_SHOW")}>
                                {BOOKING_WORDS.didntCome}
                            </MarkButton>
                        ) : null}
                    </span>
                ) : null}
            </span>
            <span className="whitespace-nowrap text-xs text-muted-foreground">
                {row.state}
            </span>
        </li>
    );
}

function MarkButton({
    onClick,
    children,
}: {
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <Button variant="outline" size="sm" type="button" onClick={onClick}>
            {children}
        </Button>
    );
}

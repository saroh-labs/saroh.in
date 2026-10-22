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

import { useHold } from "@/components/shared/undo/use-hold";
import type { HomeToday, HomeTodayItem } from "@/lib/home/service";
import type { TodayRow } from "@/lib/home/today";
import { laterTodayLabel, todayView } from "@/lib/home/today";
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
export function Today({
    today,
    now,
    layout = "stack",
    emptyNext = null,
    marks,
}: {
    today: HomeToday;
    now: string;
    /**
     * `desk`: Home A's column beside Needs you (DEC-171, `HAPageD`), with
     * its heading, the day's count ("6 bookings, 3 pick-ups") and "3 more
     * later today". `sheet`: the phone's day sheet (U17, `HPMore`), whose
     * own title says what it is: the rows and "2 more later today", no
     * heading. `stack`: the heading over the rows.
     */
    layout?: "stack" | "desk" | "sheet";
    /** Under "Nothing booked today." on the desk: the next booking. */
    emptyNext?: string | null;
    /**
     * What has been marked and is held, kept by the caller when this list
     * comes and goes (the phone's day sheet): closing the sheet then
     * neither sends what is held nor forgets it, and Undo still works.
     */
    marks?: TodayMarks;
}) {
    const desk = layout === "desk";
    const sheet = layout === "sheet";
    const headingId = useId();
    const own = useTodayMarks(today.zone);
    const { marked, mark } = marks ?? own;

    const view = useMemo(() => {
        const items = today.items.map((item) => {
            const held = marked[item.id];
            return held ? { ...item, ...held } : item;
        });
        return todayView({ ...today, items }, new Date(now));
    }, [today, marked, now]);

    if (!view.visible) return null;

    const allHref = today.bookings ? "/calendar" : "/commerce/orders";
    const later = desk || sheet ? laterTodayLabel(view.laterToday) : "";

    return (
        <section
            aria-labelledby={sheet ? undefined : headingId}
            aria-label={sheet ? "Today" : undefined}
            className={cn("grid min-w-0", desk ? "gap-2.5" : "gap-[9px]")}
        >
            {/* In the day sheet its own title is the heading, and Open the
                calendar is its foot. */}
            {sheet ? null : (
                <div
                    className={cn(
                        "flex flex-wrap items-baseline",
                        desk ? "gap-x-2.5 gap-y-1" : "gap-[9px]",
                    )}
                >
                    <h2
                        id={headingId}
                        data-ph-unmask=""
                        className={
                            desk
                                ? "font-display text-[19px] font-semibold leading-[1.25] tracking-[-0.02em]"
                                : "label"
                        }
                    >
                        Today
                    </h2>
                    <span className="text-[12.5px] text-muted-foreground">
                        {desk ? view.dayCount : view.count}
                    </span>
                    <TextLink href={allHref} className="ml-auto text-[12.5px]">
                        {today.bookings ? "Open the calendar" : "All orders"}
                    </TextLink>
                </div>
            )}

            <ul className="overflow-hidden rounded-xl border border-border bg-card">
                {view.dayDone ? (
                    <li className="px-4 py-3.5">
                        <EmptyState
                            size="inline"
                            title="Nothing more today."
                            description={desk || sheet ? emptyNext : null}
                        />
                    </li>
                ) : null}
                {view.empty ? (
                    <li className="px-4 py-3.5">
                        <EmptyState
                            size="inline"
                            title="Nothing booked today."
                            description={desk || sheet ? emptyNext : null}
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
                {later ? (
                    <li className="flex min-h-11 items-center border-t border-border px-4 py-2">
                        <TextLink
                            href={allHref}
                            className="text-[12.5px] coarse:min-h-11"
                        >
                            {later}
                        </TextLink>
                    </li>
                ) : null}
            </ul>
        </section>
    );
}

export interface TodayMarks {
    marked: Partial<Record<string, Marked>>;
    mark: (row: TodayRow, outcome: Outcome) => void;
}

/**
 * Mark arrived and Didn't come, held for Undo (`useHold`): the row reads
 * "Came at 9:32 am" at once, and Undo drops it before anything is written.
 * A refusal puts the row back and says why.
 */
export function useTodayMarks(zone: string): TodayMarks {
    const router = useRouter();
    const { hold } = useHold();
    const [marked, setMarked] = useState<Partial<Record<string, Marked>>>({});

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
                outcome === "ATTENDED" ? clockValue(new Date(), zone) : null,
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

    return { marked, mark };
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

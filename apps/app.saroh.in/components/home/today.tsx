"use client";

import { Badge } from "@saroh/ui/badge";
import { cn } from "@saroh/ui/lib/utils";
import { showError } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useId, useMemo, useState } from "react";

import { useHeld } from "@/components/bookings/calendar/use-held";
import type { HomeToday, HomeTodayItem } from "@/lib/home/service";
import type { TodayRow } from "@/lib/home/today";
import { clockNow, todayView } from "@/lib/home/today";
import { recordBookingOutcome } from "@/lib/services/actions";

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
 * holds them (`useHeld`): the row reads "Arrived 09:32" at once, and Undo
 * drops it before anything is written. Without `booking:write` the states
 * show and nothing can be marked. A refusal (a booking cancelled meanwhile)
 * puts the row back and says why.
 */
export function Today({ today, now }: { today: HomeToday; now: string }) {
    const headingId = useId();
    const router = useRouter();
    const { hold } = useHeld();
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
                    ? clockNow(new Date(), today.zone)
                    : null,
        });
        const who = row.person?.split(" ")[0] ?? "They";
        hold(
            `home-outcome:${row.id}`,
            outcome === "ATTENDED"
                ? `${who} arrived.`
                : `Marked ${who} a no-show.`,
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
                <h2
                    id={headingId}
                    className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
                >
                    Today
                </h2>
                <span className="text-[12.5px] text-muted-foreground">
                    {view.count}
                </span>
                <Link
                    href={today.bookings ? "/bookings" : "/commerce/orders"}
                    className="ml-auto rounded text-[12.5px] font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                    {today.bookings ? "Open the calendar" : "All orders"}
                </Link>
            </div>

            <ul className="overflow-hidden rounded-xl border border-border bg-card">
                {view.empty ? (
                    <li className="px-4 py-3.5 text-[13.5px] text-muted-foreground">
                        Nothing else booked today.
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
                "relative grid grid-cols-[56px_minmax(0,1fr)_auto] items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/60 active:bg-muted",
                !first && "border-t border-border",
            )}
        >
            <span
                className={cn(
                    "font-display text-[15px] font-semibold tabular-nums",
                    first ? "text-brand" : "text-foreground",
                )}
            >
                {row.time}
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
                        className="mt-[3px] justify-self-start px-2 py-0.5 text-[11.5px] font-semibold"
                    >
                        {flag}
                    </Badge>
                ))}
                {marks ? (
                    <span className="relative z-10 mt-2 flex flex-wrap gap-2">
                        {row.canArrive ? (
                            <MarkButton onClick={() => onMark("ATTENDED")}>
                                Arrived
                            </MarkButton>
                        ) : null}
                        {row.canNoShow ? (
                            <MarkButton onClick={() => onMark("NO_SHOW")}>
                                No-show
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
        <button
            type="button"
            onClick={onClick}
            className="h-[34px] rounded-lg border border-border bg-card px-3 text-[12.5px] font-semibold text-neutral-700 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-accent-active coarse:min-h-11 dark:text-neutral-300"
        >
            {children}
        </button>
    );
}

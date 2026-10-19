"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { CalendarDays, Clock } from "lucide-react";
import type { ReactNode } from "react";

import { CLOSED_HATCH } from "../geometry";

/**
 * A day on the List with nothing booked (U6). Closed, it reads as Week
 * draws it: "Closed on Sundays", who doesn't take bookings that day, and
 * "Open hours on this day". Open and quiet, it is "Nothing booked on Thu 22
 * Oct" with "Book on this day" and, while the booking page is live, "Share
 * your booking page". Someone who can't book or change hours is told what
 * is true, with no button.
 */
export function ListDayEmpty({
    closed,
    dayWords,
    today,
    past,
    canBook,
    onOpenHours,
    onBookDay,
    share,
}: {
    /** A closed day's words, as Week says them; null for an open day. */
    closed: { title: string; line: string } | null;
    /** "Sun 25 Oct". */
    dayWords: string;
    today: boolean;
    /** The day is before today: nothing to book or open. */
    past: boolean;
    canBook: boolean;
    /** Opens hours that day, for someone who may; else absent. */
    onOpenHours?: () => void;
    /** Books a free time that day; absent when there is none to book. */
    onBookDay?: () => void;
    /** "Share your booking page", while it is live; else null. */
    share: ReactNode;
}) {
    if (closed) {
        const open = onOpenHours && !past;
        return (
            <EmptyState
                data-list-empty="closed"
                icon={<Clock />}
                title={closed.title}
                description={
                    open
                        ? `${closed.line} Open some hours if you want to see someone that day.`
                        : closed.line
                }
                action={
                    open ? (
                        <Button
                            variant="outline"
                            className="wk-press"
                            onClick={onOpenHours}
                        >
                            Open hours on this day
                        </Button>
                    ) : undefined
                }
                className={CLOSED_HATCH}
            />
        );
    }

    const title = today
        ? "Nothing booked today"
        : `Nothing booked on ${dayWords}`;
    if (past)
        return (
            <EmptyState
                data-list-empty="past"
                icon={<CalendarDays />}
                title={title}
            />
        );
    const book = canBook && onBookDay;
    const offerShare = canBook && share;
    return (
        <EmptyState
            data-list-empty="open"
            icon={<CalendarDays />}
            title={title}
            description={
                canBook
                    ? share
                        ? "The day is open. Book someone in, or share your booking page so customers can."
                        : "The day is open. Book someone in."
                    : "The day is open."
            }
            action={
                book || offerShare ? (
                    <span className="flex flex-wrap items-center justify-center gap-2">
                        {book ? (
                            <Button className="wk-press" onClick={onBookDay}>
                                Book on this day
                            </Button>
                        ) : null}
                        {offerShare ? share : null}
                    </span>
                ) : undefined
            }
        />
    );
}

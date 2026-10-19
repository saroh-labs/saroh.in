"use client";

import { Button } from "@saroh/ui/button";
import { TextLink } from "@saroh/ui/text-link";
import { Info, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";

/**
 * What the Day calendar says around the grid (U4, #1020; the states of
 * BKMBookingsDay, BKMBookingsDayEmpty and BKDCalendarDay): the first-day
 * help, nobody taking bookings yet, the services' own hours and the line
 * under a phone's day. Loading is the one shell, `PageLoading`.
 */

// ── The first day's help, put away for good with Got it ────────────────────

const FIRST_DAY_KEY = "saroh:bookings:first-day-help";
const listeners = new Set<() => void>();
// Kept here too, so it stays away for the visit when the browser refuses
// storage (a private window, blocked site data).
let dismissedHere = false;

function wasDismissed(): boolean {
    if (dismissedHere) return true;
    try {
        return window.localStorage.getItem(FIRST_DAY_KEY) === "1";
    } catch {
        return false;
    }
}

function dismiss() {
    dismissedHere = true;
    try {
        window.localStorage.setItem(FIRST_DAY_KEY, "1");
    } catch {
        // Storage is full or blocked: it is gone for this visit all the same.
    }
    listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** For tests: forget that the help was put away. */
export function resetFirstDayHelp() {
    dismissedHere = false;
}

/**
 * The first day (BKMBookingsDayEmpty, BKDCalendarDay "first day"): "Meera's
 * day is open" and three things to know, "Change Meera's hours" and Got it,
 * which puts it away for this viewer. On the desk a card above the day; on
 * a phone a dark card over the calendar, above New booking. The server
 * never draws it (it can't know it was put away), so it never flashes back.
 */
export function FirstDayHelp({
    name,
    hoursHref,
}: {
    /** Whose day: "Meera"; null when several are shown. */
    name: string | null;
    /** Their Hours and time off, for someone who may change them. */
    hoursHref: string | null;
}) {
    const dismissed = useSyncExternalStore(subscribe, wasDismissed, () => true);
    if (dismissed) return null;
    const title = name ? `${name}'s day is open` : "The day is open";
    const change = name ? `Change ${name}'s hours` : "Change hours";
    return (
        <>
            <section
                aria-label="How your calendar works"
                data-first-day=""
                className="mb-3 flex items-start gap-6 rounded-[12px] border border-border bg-card px-[18px] py-4 max-[759px]:hidden"
            >
                <div className="min-w-0 flex-1">
                    <h2 className="m-0 font-display text-[17px] font-semibold tracking-[-0.02em]">
                        {title}
                    </h2>
                    <ol className="mb-0 mt-2 grid list-decimal gap-1 pl-[18px] text-[13.5px] leading-normal text-foreground/85">
                        <li>
                            Click a{" "}
                            <strong className="text-success-subtle-foreground">
                                green free time
                            </strong>{" "}
                            to book someone into it, or block it.
                        </li>
                        <li>
                            Or use <strong>New booking</strong> to pick any day
                            and time.
                        </li>
                        <li>
                            Click a booking to mark them arrived, take payment,
                            move or cancel it.
                        </li>
                    </ol>
                </div>
                <div className="flex shrink-0 gap-2">
                    {hoursHref ? (
                        <Button asChild variant="outline">
                            <Link href={hoursHref}>{change}</Link>
                        </Button>
                    ) : null}
                    <Button onClick={dismiss}>Got it</Button>
                </div>
            </section>
            <section
                aria-label="How your calendar works"
                data-first-day-phone=""
                className="fixed inset-x-3 bottom-[calc(88px+var(--tab-bar-inset,0px))] z-30 rounded-[16px] bg-foreground px-4 pb-3 pt-4 text-background shadow-xl min-[760px]:hidden"
            >
                <h2 className="m-0 font-display text-[17px] font-semibold">
                    {title}
                </h2>
                <ol className="m-0 mt-2.5 grid list-none gap-2.5 p-0">
                    {[
                        <>
                            Tap a{" "}
                            <strong className="text-success-subtle">
                                green free time
                            </strong>{" "}
                            to book someone into it.
                        </>,
                        <>
                            Or tap <strong>New booking</strong> to pick any day
                            and time.
                        </>,
                        <>
                            Tap a booking to mark them arrived, take payment,
                            move or cancel it.
                        </>,
                    ].map((tip, i) => (
                        <li
                            key={i}
                            className="flex gap-2.5 text-[13.5px] leading-[1.45]"
                        >
                            <b
                                aria-hidden
                                className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-foreground text-[12px] text-background"
                            >
                                {i + 1}
                            </b>
                            <span>{tip}</span>
                        </li>
                    ))}
                </ol>
                <div className="mt-2.5 flex items-center justify-between">
                    {hoursHref ? (
                        <Link
                            href={hoursHref}
                            className="inline-flex min-h-11 items-center text-[13.5px] font-semibold text-background underline underline-offset-2"
                        >
                            {change}
                        </Link>
                    ) : (
                        <span />
                    )}
                    <Button
                        size="sm"
                        onClick={dismiss}
                        className="min-h-11 bg-background text-foreground hover:bg-background/90"
                    >
                        Got it
                    </Button>
                </div>
            </section>
        </>
    );
}

// ── Nobody takes bookings yet ───────────────────────────────────────────────

/**
 * Nobody on the diary and no service with hours of its own: "Who takes
 * bookings?" and the one next step, Add who takes bookings. On a phone
 * also "Or give each service its own hours", to Services.
 */
export function NobodyTakesBookings({ onAdd }: { onAdd?: () => void }) {
    return (
        <div
            data-nobody-yet=""
            className="flex flex-col items-center gap-2 rounded-[12px] border border-dashed border-border-strong bg-card px-6 py-14 text-center max-[759px]:border-solid max-[759px]:border-border max-[759px]:px-5 max-[759px]:py-7"
        >
            <Users aria-hidden className="size-7 text-muted-foreground" />
            <h2 className="m-0 font-display text-[19px] font-semibold tracking-[-0.02em]">
                Who takes bookings?
            </h2>
            <p className="m-0 max-w-[56ch] text-[13.5px] leading-normal text-muted-foreground">
                {onAdd ? "Add yourself or your team with your hours. " : null}
                <span className="max-[759px]:hidden">
                    Each person gets their own column here, and customers can
                    book their free time.
                </span>
                <span className="min-[760px]:hidden">
                    Each person gets their own day here, and customers can book
                    their free time.
                </span>
            </p>
            {onAdd ? (
                <Button
                    onClick={onAdd}
                    className="mt-1.5 max-[759px]:mt-2.5 max-[759px]:min-h-11 max-[759px]:w-full"
                >
                    <Plus aria-hidden className="max-[759px]:hidden" />
                    Add who takes bookings
                </Button>
            ) : null}
            <TextLink
                href="/services"
                className="inline-flex min-h-11 items-center text-[13.5px] min-[760px]:hidden"
            >
                Or give each service its own hours
            </TextLink>
        </div>
    );
}

// ── The services' own hours ─────────────────────────────────────────────────

/**
 * Nobody takes bookings, so customers book each service in its own hours
 * (UX-023): said once above the one column, with Add who takes bookings —
 * a button on the desk, the words themselves on a phone.
 */
export function ServiceHoursNote({ onAdd }: { onAdd?: () => void }) {
    return (
        <div
            data-service-hours-note=""
            className="mb-3 flex items-center gap-3.5 rounded-[12px] border border-border bg-card px-4 py-3 max-[759px]:mb-2.5 max-[759px]:items-start max-[759px]:gap-2.5 max-[759px]:rounded-[10px] max-[759px]:border-muted max-[759px]:bg-muted/40 max-[759px]:px-3 max-[759px]:py-2.5"
        >
            <Info
                aria-hidden
                className="size-5 shrink-0 text-muted-foreground max-[759px]:size-[18px]"
            />
            <p className="m-0 min-w-0 flex-1 text-[13.5px] leading-normal max-[759px]:text-[13px] max-[759px]:text-foreground/85">
                <strong className="max-[759px]:font-normal">
                    Nobody takes bookings yet,
                </strong>{" "}
                so customers book each service in its own hours.
                {onAdd ? (
                    <>
                        <span className="max-[759px]:hidden">
                            {" "}
                            Add who takes bookings to give each person a column
                            of their own.
                        </span>
                        <span className="min-[760px]:hidden">
                            {" "}
                            <TextLink
                                onClick={onAdd}
                                className="font-semibold text-foreground underline"
                            >
                                Add who takes bookings
                            </TextLink>{" "}
                            to give each person a day of their own.
                        </span>
                    </>
                ) : null}
            </p>
            {onAdd ? (
                <Button
                    variant="outline"
                    onClick={onAdd}
                    className="shrink-0 max-[759px]:hidden"
                >
                    Add who takes bookings
                </Button>
            ) : null}
        </div>
    );
}

// ── Under a phone's day ─────────────────────────────────────────────────────

/** The one line under the day on a phone: how to move about, or the key. */
export function DayFoot({ first }: { first: boolean }) {
    return (
        <p className="mb-0 mt-2.5 text-[12.5px] leading-normal text-muted-foreground min-[760px]:hidden">
            {first
                ? "Free times show in green, so you can see at a glance where a booking fits."
                : "Swipe the calendar left or right to change day. Tap the date at the top for any day, Week or List."}
        </p>
    );
}

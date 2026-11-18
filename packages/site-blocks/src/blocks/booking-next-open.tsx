"use client";

import type { LookId } from "@saroh/block-contract";

import { dateText } from "../booking-flow/model";
import { timeWords } from "../lib/clock";
import { dayLabel } from "../lib/timetable-read";
import { cn } from "../lib/utils";
import type { BusinessReach } from "../reach-links";
import { ReachLinks } from "../reach-links";
import { ctaClasses } from "./cta";
import { FRONT_TYPE, frontButton } from "./look-front";

/**
 * Book's `nextOpen` layout (BLOCK-MAP §3 block 10, board LCBook "Next
 * open"): the soonest three open days, each with its first times, and a
 * strip of the two weeks under them. Every time and every open day is a
 * link into the booking page at that step (booking is one route); "See
 * every time" opens it for the service. Times are Open, never "Free".
 *
 * Days come from the booking page's own read, in the browser, so the
 * cached page never says Today. A day with nothing open (closed, full, or
 * today after its last time) stays in the strip, plain and not a link.
 */

/** A free time (UTC ISO). */
export interface OpenSlot {
    startAt: string;
    endAt: string;
}

/** One day of the read: its open times; `closed` when the business is. */
export interface OpenDay {
    date: string;
    closed: boolean;
    starts: OpenSlot[];
}

export type NextOpenState =
    | { kind: "loading" }
    /** `fromToday`: the read's days start today (the API's); not samples. */
    | { kind: "ready"; days: OpenDay[]; zone: string; fromToday: boolean }
    | { kind: "closed" }
    | { kind: "error" };

/** The first `count` days with a time open. */
export function nextOpenDays(days: readonly OpenDay[], count = 3): OpenDay[] {
    return days.filter((d) => d.starts.length > 0).slice(0, count);
}

const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
] as const;

function monthOf(date: string): string {
    const d = new Date(`${date}T12:00:00Z`);
    return Number.isNaN(d.getTime())
        ? ""
        : `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function dayParts(date: string): { name: string; day: string } {
    const [name = "", day = date] = dayLabel(date).split(" ");
    return { name, day };
}

const FOCUS =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-fg focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg";

const SLOT = cn(
    "border-site-border text-site-fg bg-site-bg hover:border-site-fg inline-flex min-h-11 cursor-pointer items-center whitespace-nowrap rounded-[var(--site-radius)] border px-3.5 text-[15px] tabular-nums",
    FOCUS,
);

export function BookingNextOpen({
    look,
    title,
    description,
    beforeYouBook,
    state,
    onRetry,
    bookUrl,
    dayHref,
    timeHref,
    askHref,
    reach,
}: {
    /** Absent: Classic. */
    look?: LookId;
    title: string | null;
    description: string | null;
    beforeYouBook: string | null;
    state: NextOpenState;
    onRetry: () => void;
    /** The booking page for this service; absent where no site is live. */
    bookUrl?: string;
    dayHref: (date: string) => string | undefined;
    timeHref: (date: string, slot: OpenSlot) => string | undefined;
    /** The enquiry form, for "Ask us" when nothing is open. */
    askHref?: string | null;
    reach: BusinessReach | null;
}) {
    const main = look ? frontButton(look, "fill") : ctaClasses("primary");
    const second = look
        ? frontButton(look, "outline")
        : ctaClasses("secondary");
    const strip =
        state.kind === "ready" ? state.days : ([] as readonly OpenDay[]);
    const soonest = nextOpenDays(strip);
    const fromToday = state.kind === "ready" && state.fromToday;
    const near = (date: string): string | null =>
        !fromToday
            ? null
            : date === strip[0]?.date
              ? "Today"
              : date === strip[1]?.date
                ? "Tomorrow"
                : null;
    return (
        <section
            data-booking-next-open=""
            className="text-site-fg mx-auto grid w-full max-w-screen-xl gap-10 px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)] min-[1000px]:grid-cols-[minmax(0,1fr)_520px] min-[1000px]:items-start"
        >
            <div className="grid min-w-0 content-start gap-3">
                {title ? (
                    <h2
                        data-site-title=""
                        className={
                            look
                                ? FRONT_TYPE[look].h2
                                : "font-site-heading text-[calc(1.875rem*var(--site-heading-scale))] font-semibold tracking-[-0.01em]"
                        }
                    >
                        {title}
                    </h2>
                ) : null}
                {description ? (
                    <p className="text-site-body max-w-[52ch] text-[16px] leading-relaxed">
                        {description}
                    </p>
                ) : null}
            </div>
            <div
                className={cn(
                    "grid min-w-0 content-start gap-5 p-6",
                    look === "live"
                        ? "bg-site-surface rounded-site-photo"
                        : "border-site-border rounded-[calc(var(--site-radius)*1.4)] border",
                )}
            >
                <h3 className="text-site-fg text-[15px] font-semibold">
                    Next open
                </h3>
                {beforeYouBook ? <BeforeYouBook text={beforeYouBook} /> : null}
                {state.kind === "loading" ? (
                    <p
                        role="status"
                        className="text-site-muted min-h-[120px] text-[15px]"
                    >
                        Checking open times…
                    </p>
                ) : state.kind === "error" ? (
                    <div role="alert" className="grid gap-3 text-[15px]">
                        <p className="text-site-body">
                            <b className="text-site-fg font-semibold">
                                Open times didn&apos;t load.
                            </b>{" "}
                            Booking still works on the booking page.
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                onClick={onRetry}
                                className={second}
                            >
                                Try again
                            </button>
                            {bookUrl ? (
                                <a
                                    href={bookUrl}
                                    className="text-site-fg inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
                                >
                                    Booking page
                                </a>
                            ) : null}
                        </div>
                    </div>
                ) : state.kind === "closed" ? (
                    <div className="grid gap-1 text-[15px]">
                        <p className="text-site-body">
                            Online booking isn&apos;t open right now. Please get
                            in touch to book.
                        </p>
                        <ReachLinks reach={reach} />
                    </div>
                ) : soonest.length === 0 ? (
                    <div data-booking-none="" className="grid gap-3">
                        <p className="font-site-heading text-site-fg text-[22px] leading-tight">
                            No open times in the next two weeks
                        </p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                            {askHref ? (
                                <a href={askHref} className={main}>
                                    Ask us
                                </a>
                            ) : null}
                            <ReachLinks reach={reach} />
                        </div>
                    </div>
                ) : (
                    <>
                        <ul className="grid gap-3.5">
                            {soonest.map((day) => (
                                <li
                                    key={day.date}
                                    className="border-site-border grid gap-2 border-b pb-3.5 min-[480px]:grid-cols-[96px_minmax(0,1fr)] min-[480px]:items-center"
                                >
                                    <span>
                                        <b className="text-site-fg block text-[15px] font-semibold">
                                            {dateText(day.date, true)}
                                        </b>
                                        {near(day.date) ? (
                                            <small className="text-site-muted text-[13px]">
                                                {near(day.date)}
                                            </small>
                                        ) : null}
                                    </span>
                                    <span className="flex flex-wrap gap-2">
                                        {day.starts.slice(0, 4).map((slot) => {
                                            const time = timeWords(
                                                slot.startAt,
                                                state.zone,
                                            );
                                            const href = timeHref(
                                                day.date,
                                                slot,
                                            );
                                            const label = `${dateText(day.date, true)} at ${time}, open`;
                                            return href ? (
                                                <a
                                                    key={slot.startAt}
                                                    href={href}
                                                    aria-label={`Book ${label}`}
                                                    className={SLOT}
                                                >
                                                    {time}
                                                </a>
                                            ) : (
                                                <span
                                                    key={slot.startAt}
                                                    aria-label={label}
                                                    className={SLOT}
                                                >
                                                    {time}
                                                </span>
                                            );
                                        })}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        <MonthStrip
                            days={strip}
                            dayHref={dayHref}
                            fromToday={fromToday}
                        />
                    </>
                )}
                {state.kind === "closed" || !bookUrl ? null : (
                    <a href={bookUrl} className={cn(main, "justify-center")}>
                        See every time
                    </a>
                )}
            </div>
        </section>
    );
}

/** The owner's "Before you book" words, over the times (R9). */
export function BeforeYouBook({ text }: { text: string }) {
    return (
        <p
            data-before-you-book=""
            className="bg-site-surface text-site-fg rounded-[calc(var(--site-radius)*1.4)] px-4 py-3.5 text-[15px] leading-relaxed"
        >
            <b className="font-semibold">Before you book:</b> {text}
        </p>
    );
}

/** The two weeks, a cell a day: open days link to that day. */
function MonthStrip({
    days,
    dayHref,
    fromToday,
}: {
    days: readonly OpenDay[];
    dayHref: (date: string) => string | undefined;
    fromToday: boolean;
}) {
    if (days.length === 0) return null;
    const first = days[0];
    return (
        <div className="grid gap-2.5">
            <p className="text-site-fg text-[15px] font-semibold">
                {monthOf(first.date)}
            </p>
            <ul
                aria-label="Pick a day"
                className="-mx-0.5 flex gap-1 overflow-x-auto p-0.5 [scrollbar-width:none]"
            >
                {days.map((day, i) => {
                    const { name, day: n } = dayParts(day.date);
                    const open = day.starts.length > 0;
                    const href = open ? dayHref(day.date) : undefined;
                    const said = day.closed ? "Closed" : "Full";
                    const label = `${dateText(day.date, true)}, ${open ? "open times" : said.toLowerCase()}`;
                    const body = (
                        <>
                            <span className="text-site-muted text-[12px]">
                                {fromToday && i === 0 ? "Today" : name}
                            </span>
                            <b
                                className={cn(
                                    "text-[17px] tabular-nums",
                                    open
                                        ? "text-site-fg font-semibold"
                                        : "text-site-muted font-normal",
                                )}
                            >
                                {n}
                            </b>
                            <span
                                aria-hidden="true"
                                className={cn(
                                    "size-1.5 rounded-full",
                                    open && "bg-site-accent",
                                )}
                            />
                        </>
                    );
                    const cell =
                        "flex min-h-[62px] w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[min(var(--site-radius),10px)] border";
                    return (
                        <li key={day.date}>
                            {href ? (
                                <a
                                    href={href}
                                    aria-label={label}
                                    data-day-open=""
                                    className={cn(
                                        cell,
                                        "border-site-border bg-site-bg hover:border-site-fg",
                                        FOCUS,
                                    )}
                                >
                                    {body}
                                </a>
                            ) : (
                                <span
                                    aria-label={label}
                                    className={cn(
                                        cell,
                                        "border-transparent",
                                        fromToday &&
                                            i === 0 &&
                                            "bg-site-surface",
                                    )}
                                >
                                    {body}
                                </span>
                            )}
                        </li>
                    );
                })}
            </ul>
            <p className="text-site-muted flex flex-wrap gap-4 text-[13px]">
                <span className="inline-flex items-center gap-1.5">
                    <span
                        aria-hidden="true"
                        className="bg-site-accent size-1.5 rounded-full"
                    />
                    Open times that day
                </span>
                <span>Plain: closed or full</span>
            </p>
        </div>
    );
}

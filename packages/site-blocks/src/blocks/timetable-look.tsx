"use client";

import type { LookId } from "@saroh/block-contract";
import type { KeyboardEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";

import type { CreditFor } from "../booking-flow/api";
import { clockWords } from "../lib/clock";
import type { PublicTimetable, TimetableSession } from "../lib/timetable-read";
import { dayLabel, sessionHref } from "../lib/timetable-read";
import { cn } from "../lib/utils";
import { placesLeftWords } from "../live/live-words";
import {
    FRONT_RING,
    FRONT_TYPE,
    FRONT_WRAP,
    frontButton,
    said,
} from "./look-front";
import { formatDuration, servicePriceWords } from "./service-words";

/**
 * The week's classes under a look (DEC-172, plan U7, #1096), as VA09,
 * VD09 and VB09 draw them, desk and phone:
 *
 * - **On a desk** (from 1000px) the week across: a column a day, its name
 *   small over its date large, and its classes down it. Folio and Quiet
 *   rule them with hairlines (ruled, not boxed); Live sets each class on
 *   a soft card.
 * - **On a phone** the days are tabs (a real tablist: the arrow keys move
 *   along it) and the chosen day's classes are rows under it. Nothing
 *   scrolls sideways.
 *
 * Every row says, in words:
 * - when and how long, the class, who takes it;
 * - its PRICE, the services list's own words ("₹600", "₹600 + GST"), or
 *   "1 pack class" for a signed-in customer whose pack covers it. That is
 *   read in the browser with their session (`credit`, the booking page's
 *   own question), so the cached page never carries it;
 * - places left only when true and 5 or fewer ("3 places left", "Last
 *   place" in the accent's text colour), in a line whose height is kept
 *   from the first paint. No fake urgency;
 * - and its action: an outline **Book** of 44px into the one booking
 *   route with the class, day and time chosen, or, for a full class,
 *   **Join the waitlist** (classes only: the booking page holds a freed
 *   place by email for 2 hours, and nothing books by itself).
 *
 * A full class keeps full-strength text and says "Full" (B12): it is never
 * faded. Every Book is an outline: the page's one filled button is
 * elsewhere (the header's, or the page's own). Labels are 12px at least.
 * Drawn from `--site-*` only (G2, G7).
 */

/** What the rows show, as the section set it. */
export interface TimetableShow {
    trainer: boolean;
    places: boolean;
    bookHref?: string;
}

/** Places left are said only when true and this few or fewer (U8). */
export { PLACES_SHOWN_AT_MOST as FEW_PLACES } from "../live/live-words";

/**
 * "3 places left", "Last place", "Full", or nothing to say. The count's
 * words are the live facts' own (`placesLeftWords`); Full is always
 * said, since it is what turns Book into Join the waitlist.
 */
export function placesLine(
    session: Pick<TimetableSession, "placesLeft">,
    showCount: boolean,
): { text: string; tone: "full" | "last" | "few" } | null {
    if (session.placesLeft <= 0) return { text: "Full", tone: "full" };
    const words = showCount ? placesLeftWords(session.placesLeft) : null;
    if (!words) return null;
    return { text: words, tone: session.placesLeft === 1 ? "last" : "few" };
}

/** A full class's way into its waitlist, on the booking page's When. */
export function waitlistHref(bookHref: string, s: TimetableSession): string {
    const q = new URLSearchParams({
        service: s.serviceId,
        date: s.date,
        step: "when",
    });
    return `${bookHref}?${q.toString()}`;
}

/** A class's price as the services list says it; null for none. */
export function sessionPrice(s: TimetableSession): string | null {
    return servicePriceWords({
        priceCents: s.priceCents ?? null,
        currency: s.currency ?? null,
        gst: s.gst ?? null,
    });
}

/**
 * What a signed-in customer would pay each class with, by class: "1 pack
 * class" for a pack, "In your membership" for a membership (a membership
 * is used before a pack, which the API decides). Asked once per class, for
 * its first session with a place, through the booking page's own credit
 * read; nothing while no one is signed in, and nothing on a failed read,
 * so the price stays.
 */
export function usePaidWith(
    credit: CreditFor | undefined,
    sessions: readonly TimetableSession[],
): Record<string, string> {
    const [words, setWords] = useState<Record<string, string>>({});
    const key = sessions
        .map((s) => `${s.serviceId}@${s.startAt}:${s.placesLeft > 0 ? 1 : 0}`)
        .join("|");
    useEffect(() => {
        if (!credit) return;
        const first = new Map<string, TimetableSession>();
        for (const s of sessions) {
            if (s.placesLeft > 0 && !first.has(s.serviceId)) {
                first.set(s.serviceId, s);
            }
        }
        let active = true;
        void Promise.all(
            Array.from(first.values()).map(async (s) => {
                const answer = await credit({
                    serviceId: s.serviceId,
                    startAt: s.startAt,
                }).catch(() => null);
                const offered = answer?.ok ? answer.value.credit : null;
                if (!offered) return null;
                const said: [string, string] = [
                    s.serviceId,
                    offered.kind === "PACK"
                        ? "1 pack class"
                        : "In your membership",
                ];
                return said;
            }),
        ).then((found) => {
            if (!active) return;
            const pairs: [string, string][] = [];
            for (const pair of found) if (pair) pairs.push(pair);
            setWords(Object.fromEntries(pairs));
        });
        return () => {
            active = false;
        };
        // The sessions are read by their key: a new array with the same
        // classes asks nothing again.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [credit, key]);
    return words;
}

export function LookTimetable({
    look,
    title,
    lede,
    week,
    days,
    show,
    credit,
    checked = null,
}: {
    look: LookId;
    title: string;
    /** "13 sessions across 5 days." and the merchant's line, when set. */
    lede: string | null;
    /** "Places checked 5:20 pm", while the counts are fresh (U8). */
    checked?: string | null;
    week: PublicTimetable;
    days: string[];
    show: TimetableShow;
    /** The signed-in customer's credit read (the booking page's own). */
    credit?: CreditFor;
}) {
    const type = FRONT_TYPE[look];
    const paidWith = usePaidWith(credit, week.sessions);
    const byDay = (date: string) =>
        week.sessions.filter((s) => s.date === date);
    return (
        <section
            data-site-look-timetable={look}
            className="text-site-fg w-full py-[var(--site-section-padding)]"
        >
            <div className={FRONT_WRAP}>
                <div
                    className={cn(
                        "grid gap-3 pb-6 min-[700px]:pb-10",
                        look === "quiet" && "min-[700px]:text-center",
                    )}
                >
                    <h2 data-site-title="" className={type.h2}>
                        {title}
                    </h2>
                    {lede ? (
                        <p
                            className={cn(
                                "text-site-body max-w-[60ch] text-[16px] leading-relaxed",
                                look === "quiet" && "min-[700px]:mx-auto",
                            )}
                        >
                            {lede}
                        </p>
                    ) : null}
                    {/* Its height kept, so nothing moves as it comes. */}
                    <p
                        data-timetable-checked=""
                        className={cn(
                            "text-site-muted min-h-[20px] text-[13px] tabular-nums",
                            look === "quiet" && "min-[700px]:text-center",
                        )}
                    >
                        {checked ?? ""}
                    </p>
                </div>
                <div className="max-[999px]:hidden">
                    <WeekColumns
                        look={look}
                        days={days}
                        byDay={byDay}
                        show={show}
                        paidWith={paidWith}
                    />
                </div>
                <div className="min-[1000px]:hidden">
                    <DayTabs
                        look={look}
                        days={days}
                        byDay={byDay}
                        show={show}
                        paidWith={paidWith}
                    />
                </div>
            </div>
        </section>
    );
}

interface DayProps {
    look: LookId;
    days: string[];
    byDay: (date: string) => TimetableSession[];
    show: TimetableShow;
    paidWith: Record<string, string>;
}

/** "Mon" and "19" from `2026-10-19`, as the boards set a day's head. */
function dayParts(date: string): { name: string; day: string } {
    const [name = date, day = ""] = dayLabel(date).split(" ");
    return { name, day };
}

const COLUMN: Record<LookId, string> = {
    folio: "border-site-border border-r last:border-r-0 px-3",
    quiet: "border-site-border border-r last:border-r-0 px-3",
    live: "",
};

/** The week across, a column a day (desk). */
function WeekColumns({ look, days, byDay, show, paidWith }: DayProps) {
    return (
        <div
            className={cn(
                "grid grid-cols-7",
                look === "live" ? "gap-3" : "border-site-border border-t",
            )}
        >
            {days.map((date, i) => {
                const { name, day } = dayParts(date);
                const sessions = byDay(date);
                return (
                    <section
                        key={date}
                        aria-label={dayLabel(date, true)}
                        className={cn(
                            "grid min-w-0 content-start",
                            COLUMN[look],
                        )}
                    >
                        <h3 className="grid justify-items-center gap-0.5 pb-4 pt-5">
                            <span className={FRONT_TYPE[look].eyebrow}>
                                {i === 0 ? `${name} · today` : name}
                            </span>
                            <span
                                className={cn(
                                    "font-site-heading text-[34px] tabular-nums leading-tight",
                                    look === "live"
                                        ? "font-extrabold"
                                        : "font-light",
                                    i === 0 &&
                                        look !== "live" &&
                                        "underline decoration-1 underline-offset-[10px]",
                                )}
                            >
                                {day}
                            </span>
                        </h3>
                        {sessions.length > 0 ? (
                            <ul
                                className={cn(
                                    "grid",
                                    look === "live" ? "gap-2" : undefined,
                                )}
                            >
                                {sessions.map((s) => (
                                    <li key={`${s.serviceId}:${s.startAt}`}>
                                        <Cell
                                            look={look}
                                            session={s}
                                            show={show}
                                            paidWith={paidWith[s.serviceId]}
                                        />
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p
                                className={cn(
                                    "text-site-muted py-4 text-center text-[13px]",
                                    look !== "live" &&
                                        "border-site-border border-t",
                                )}
                            >
                                No classes
                            </p>
                        )}
                    </section>
                );
            })}
        </div>
    );
}

/** One class in a day's column (desk). */
function Cell({
    look,
    session,
    show,
    paidWith,
}: {
    look: LookId;
    session: TimetableSession;
    show: TimetableShow;
    paidWith?: string;
}) {
    const words = wordsOf(session, show, paidWith);
    return (
        <div
            data-timetable-row=""
            className={cn(
                "grid min-w-0 gap-0.5 text-[13.5px] leading-[1.4]",
                look === "live"
                    ? "bg-site-surface rounded-site-s p-3"
                    : "border-site-border border-t px-1 py-4",
            )}
        >
            <span className="text-site-muted text-[13px] tabular-nums">
                {words.when}
            </span>
            <span
                className={cn(
                    "font-site-heading text-site-fg text-[19px] leading-tight [overflow-wrap:anywhere]",
                    look === "live" ? "text-[16px] font-bold" : "font-normal",
                )}
            >
                {session.serviceName}
            </span>
            {words.who ? (
                <span className="text-site-muted text-[13px]">{words.who}</span>
            ) : null}
            {words.price ? (
                <span
                    data-timetable-price=""
                    className="text-site-fg text-[13px] font-semibold tabular-nums"
                >
                    {words.price}
                </span>
            ) : null}
            <Places line={words.places} />
            <Action
                look={look}
                session={session}
                show={show}
                className="mt-1.5 justify-self-start"
            />
        </div>
    );
}

/** The days as tabs, and the chosen day's rows (phone). */
function DayTabs({ look, days, byDay, show, paidWith }: DayProps) {
    const [chosen, setChosen] = useState(0);
    const id = useId();
    const tabs = useRef<(HTMLButtonElement | null)[]>([]);
    const at = Math.min(chosen, Math.max(0, days.length - 1));
    const date = days[at];

    function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        const step =
            event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        const to =
            event.key === "Home"
                ? 0
                : event.key === "End"
                  ? days.length - 1
                  : step !== 0
                    ? (at + step + days.length) % days.length
                    : null;
        if (to === null) return;
        event.preventDefault();
        setChosen(to);
        tabs.current[to]?.focus();
    }

    if (!date) return null;
    const sessions = byDay(date);
    return (
        <div>
            <div
                role="tablist"
                aria-label="Day"
                onKeyDown={onKeyDown}
                className="grid grid-cols-7 gap-1"
            >
                {days.map((d, i) => {
                    const { name, day } = dayParts(d);
                    const on = i === at;
                    return (
                        <button
                            key={d}
                            ref={(el) => {
                                tabs.current[i] = el;
                            }}
                            type="button"
                            role="tab"
                            id={`${id}-tab-${i}`}
                            aria-selected={on}
                            aria-controls={`${id}-panel`}
                            tabIndex={on ? 0 : -1}
                            onClick={() => setChosen(i)}
                            className={cn(
                                "grid min-h-[64px] min-w-0 cursor-pointer content-center justify-items-center gap-0.5 text-[12px] transition-colors duration-[var(--site-motion-base,140ms)]",
                                look === "folio"
                                    ? "rounded-none"
                                    : "rounded-site-s",
                                on
                                    ? "bg-site-fg text-site-bg"
                                    : "text-site-fg hover:bg-site-fg/5",
                                FRONT_RING,
                            )}
                        >
                            <span>{name}</span>
                            <span
                                className={cn(
                                    "font-site-heading text-[22px] tabular-nums leading-none",
                                    look === "live"
                                        ? "font-extrabold"
                                        : "font-normal",
                                )}
                            >
                                {day}
                            </span>
                        </button>
                    );
                })}
            </div>
            <div
                role="tabpanel"
                id={`${id}-panel`}
                aria-labelledby={`${id}-tab-${at}`}
                className="pt-6"
            >
                <p className={cn(FRONT_TYPE[look].eyebrow, "pb-2")}>
                    {dayLabel(date, true)}
                </p>
                {sessions.length > 0 ? (
                    <ul
                        className={cn(
                            look === "live"
                                ? "grid gap-2"
                                : "border-site-border border-t",
                        )}
                    >
                        {sessions.map((s) => (
                            <li key={`${s.serviceId}:${s.startAt}`}>
                                <Row
                                    look={look}
                                    session={s}
                                    show={show}
                                    paidWith={paidWith[s.serviceId]}
                                />
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-site-muted py-4 text-[14px]">
                        No classes on this day.
                    </p>
                )}
            </div>
        </div>
    );
}

/** One class on a phone: the time, the words, and its action. */
function Row({
    look,
    session,
    show,
    paidWith,
}: {
    look: LookId;
    session: TimetableSession;
    show: TimetableShow;
    paidWith?: string;
}) {
    const words = wordsOf(session, show, paidWith);
    return (
        <div
            data-timetable-row=""
            className={cn(
                "grid grid-cols-[64px_minmax(0,1fr)] items-start gap-x-3 gap-y-2",
                look === "live"
                    ? "bg-site-surface rounded-site-s p-3"
                    : "border-site-border border-b py-4",
            )}
        >
            <span className="font-site-heading text-site-fg pt-0.5 text-[18px] tabular-nums leading-tight">
                {clockWords(session.time)}
            </span>
            <div className="grid min-w-0 gap-0.5">
                <span
                    className={cn(
                        "font-site-heading text-site-fg text-[19px] leading-tight [overflow-wrap:anywhere]",
                        look === "live"
                            ? "text-[16px] font-bold"
                            : "font-normal",
                    )}
                >
                    {session.serviceName}
                </span>
                <span className="text-site-muted text-[13px]">
                    {[formatDuration(session.durationMinutes), words.who]
                        .filter(Boolean)
                        .join(" · ")}
                </span>
                {words.price ? (
                    <span
                        data-timetable-price=""
                        className="text-site-fg text-[13px] font-semibold tabular-nums"
                    >
                        {words.price}
                    </span>
                ) : null}
                <Places line={words.places} />
                <Action
                    look={look}
                    session={session}
                    show={show}
                    className="mt-1 justify-self-start"
                />
            </div>
        </div>
    );
}

/** The words a class wears, shared by the desk's cell and the phone's row. */
function wordsOf(
    session: TimetableSession,
    show: TimetableShow,
    paidWith?: string,
) {
    const who = show.trainer ? said(session.staffName) : null;
    return {
        when: `${clockWords(session.time)} · ${formatDuration(session.durationMinutes)}`,
        who,
        // A pack or membership that covers it, else the class's price.
        price: paidWith ?? sessionPrice(session),
        places: placesLine(session, show.places),
    };
}

/**
 * The places line, its height kept whether or not it has words, so a row
 * never jumps. "Last place" is in the accent's text colour (4.5:1, KD4);
 * "Full" in the ink, never faded.
 */
function Places({ line }: { line: ReturnType<typeof placesLine> }) {
    return (
        <span
            data-timetable-places={line?.tone ?? ""}
            className={cn(
                "block min-h-[20px] text-[13px] font-semibold",
                line?.tone === "full"
                    ? "text-site-fg"
                    : "text-site-accent-text",
            )}
        >
            {line?.text ?? ""}
        </span>
    );
}

/** Book, or Join the waitlist for a full class; nothing without a page. */
function Action({
    look,
    session,
    show,
    className,
}: {
    look: LookId;
    session: TimetableSession;
    show: TimetableShow;
    className?: string;
}) {
    if (!show.bookHref) return null;
    const when = `${dayLabel(session.date, true)} at ${clockWords(session.time)}`;
    const full = session.placesLeft <= 0;
    // Waitlists are for classes only (a timetable lists only classes).
    if (full) {
        if (session.capacity <= 1) return null;
        return (
            <a
                href={waitlistHref(show.bookHref, session)}
                aria-label={`Join the waitlist: ${session.serviceName}, ${when}`}
                className={frontButton(look, "quiet", cn("px-4", className))}
            >
                Join the waitlist
            </a>
        );
    }
    return (
        <a
            href={sessionHref(show.bookHref, session)}
            aria-label={`Book ${session.serviceName}, ${when}`}
            className={frontButton(look, "outline", cn("px-5", className))}
        >
            Book
        </a>
    );
}

/**
 * A look's week before it is read, or when the read failed: the title and
 * one message in a box of the week's own height, so the page doesn't move
 * when the classes come. The cached page is always the loading one.
 */
export function LookTimetableNote({
    look,
    title,
    lede,
    failed = false,
    onRetry,
    children,
}: {
    look: LookId;
    title: string;
    lede: string | null;
    failed?: boolean;
    onRetry?: () => void;
    children: React.ReactNode;
}) {
    const type = FRONT_TYPE[look];
    return (
        <section
            data-site-look-timetable={look}
            className="text-site-fg w-full py-[var(--site-section-padding)]"
        >
            <div className={FRONT_WRAP}>
                <div
                    className={cn(
                        "grid gap-3 pb-6 min-[700px]:pb-10",
                        look === "quiet" && "min-[700px]:text-center",
                    )}
                >
                    <h2 data-site-title="" className={type.h2}>
                        {title}
                    </h2>
                    {lede ? (
                        <p className="text-site-body max-w-[60ch] text-[16px] leading-relaxed">
                            {lede}
                        </p>
                    ) : null}
                </div>
                <div
                    role={failed ? "alert" : "status"}
                    aria-busy={failed ? undefined : true}
                    data-live-state={failed ? "failed" : "loading"}
                    className="border-site-border text-site-body grid min-h-[240px] content-start justify-items-start gap-3 border-t pt-6 text-[15px]"
                >
                    <p>{children}</p>
                    {failed && onRetry ? (
                        <button
                            type="button"
                            onClick={onRetry}
                            className={frontButton(look, "outline")}
                        >
                            Try again
                        </button>
                    ) : null}
                </div>
            </div>
        </section>
    );
}

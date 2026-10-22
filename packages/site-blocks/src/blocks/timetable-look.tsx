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
    LookEyebrow,
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
    content,
    look,
    title,
    lede,
    week,
    days,
    show,
    credit,
    checked = null,
}: {
    /** The section's content, for its eyebrow. */
    content?: unknown;
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
                    <LookEyebrow content={content} look={look} />
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
    // Board VA09: a column a day, 420 tall at least, its classes edge to edge.
    folio: "border-site-border border-r min-h-[420px]",
    quiet: "border-site-border border-r last:border-r-0 px-3",
    live: "",
};

/** The week across, a column a day (desk). */
function WeekColumns({ look, days, byDay, show, paidWith }: DayProps) {
    return (
        <div
            className={cn(
                "grid grid-cols-7",
                look === "live" && "gap-3",
                look === "quiet" && "border-site-border border-t",
                // VA09's frame: an ink rule over the week, a hairline down its side.
                look === "folio" &&
                    "border-site-border border-t-site-fg border-l border-t",
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
                        <h3
                            className={cn(
                                "grid gap-0.5",
                                look === "quiet" &&
                                    "justify-items-center pb-4 pt-5",
                                // VA09: left-aligned, today on the surface.
                                look === "folio" &&
                                    cn(
                                        "px-3.5 pb-3 pt-3.5",
                                        i === 0 && "bg-site-surface",
                                    ),
                                // VB09: an eyebrow over a 36px number, left.
                                look === "live" && "px-0.5 pb-2 pt-1",
                            )}
                        >
                            <span className={FRONT_TYPE[look].eyebrow}>
                                {i === 0 ? `${name} · today` : name}
                            </span>
                            <span
                                className={cn(
                                    "font-site-heading tabular-nums leading-tight",
                                    look === "live" &&
                                        "text-[36px] font-extrabold [font-stretch:80%]",
                                    look === "folio" &&
                                        "text-[30px] font-light",
                                    look === "quiet" &&
                                        cn(
                                            "text-[34px] font-light",
                                            i === 0 &&
                                                "underline decoration-1 underline-offset-[10px]",
                                        ),
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
    const full = session.placesLeft <= 0;
    return (
        <div
            data-timetable-row=""
            data-timetable-full={full ? "" : undefined}
            className={cn(
                "grid min-w-0 gap-0.5 text-[13.5px] leading-[1.4]",
                look === "live" && "bg-site-surface rounded-site-s gap-1 p-3",
                look === "quiet" && "border-site-border border-t px-1 py-4",
                // VA09: 14px cells, 13/1.35, a full class hatched.
                look === "folio" &&
                    cn(
                        "border-site-border border-t p-3.5 text-[13px] leading-[1.35]",
                        full && HATCH,
                    ),
            )}
        >
            {look === "live" ? (
                <BigTime
                    look={look}
                    time={session.time}
                    className="text-[22px]"
                />
            ) : (
                <span className="text-site-muted text-[13px] tabular-nums">
                    {words.when}
                </span>
            )}
            <span
                className={cn(
                    "text-site-fg leading-tight [overflow-wrap:anywhere]",
                    look === "live" && "font-site-body text-[14px] font-bold",
                    look === "folio" &&
                        "font-site-heading text-[18px] font-light",
                    look === "quiet" &&
                        "font-site-heading text-[19px] font-normal",
                )}
            >
                {session.serviceName}
            </span>
            {look === "live" ? (
                <LiveMeta session={session} words={words} />
            ) : (
                <>
                    {words.who ? (
                        <span className="text-site-muted text-[13px]">
                            {words.who}
                        </span>
                    ) : null}
                    {words.price ? (
                        <span
                            data-timetable-price=""
                            className="text-site-fg text-[13px] font-semibold tabular-nums"
                        >
                            {words.price}
                        </span>
                    ) : null}
                </>
            )}
            <Places line={words.places} look={look} />
            <Action
                look={look}
                session={session}
                show={show}
                className="mt-1.5 justify-self-start"
            />
        </div>
    );
}

/** VA09's full class: a 135° hatch in the hairline colour. */
const HATCH =
    "[background-image:repeating-linear-gradient(135deg,hsl(var(--site-border))_0_1px,transparent_1px_8px)]";

/** A class's time in the board's big type, its "am" small (VB09, VA09). */
function BigTime({
    look,
    time,
    className,
}: {
    look: LookId;
    time: string;
    className: string;
}) {
    const [clock, period] = clockWords(time).split(" ");
    return (
        <span
            className={cn(
                "font-site-heading text-site-fg tabular-nums leading-[0.9]",
                className,
            )}
        >
            <span
                className={
                    look === "live"
                        ? "font-extrabold tracking-[-0.03em] [font-stretch:80%]"
                        : "font-light"
                }
            >
                {clock}
            </span>
            {period ? (
                <span className="font-site-body ml-0.5 text-[12px] font-semibold">
                    {period}
                </span>
            ) : null}
        </span>
    );
}

/** VB09's one meta line: who · how long · price. */
function LiveMeta({
    session,
    words,
}: {
    session: TimetableSession;
    words: ReturnType<typeof wordsOf>;
}) {
    return (
        <span className="text-site-muted text-[12.5px] leading-[1.4] [overflow-wrap:anywhere]">
            {[words.who, formatDuration(session.durationMinutes)]
                .filter(Boolean)
                .join(" · ")}
            {words.price ? (
                <>
                    {" · "}
                    <span data-timetable-price="" className="tabular-nums">
                        {words.price}
                    </span>
                </>
            ) : null}
        </span>
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
                                    ? // VA09 phone: each day edged, 10 by 4.
                                      "border-site-rule rounded-none border px-1 py-2.5"
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
                                    "font-site-heading tabular-nums leading-none",
                                    look === "live" &&
                                        "text-[22px] font-extrabold",
                                    look === "folio" &&
                                        "text-[24px] font-light",
                                    look === "quiet" &&
                                        "text-[22px] font-normal",
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
                "grid items-start gap-x-3 gap-y-2",
                // VA09 phone: time, words, and Book on the right.
                look === "folio"
                    ? "grid-cols-[64px_minmax(0,1fr)_auto]"
                    : "grid-cols-[64px_minmax(0,1fr)]",
                look === "live"
                    ? "bg-site-surface rounded-site-s p-3"
                    : "border-site-border border-b py-4",
            )}
        >
            {look === "quiet" ? (
                <span className="font-site-heading text-site-fg pt-0.5 text-[18px] tabular-nums leading-tight">
                    {clockWords(session.time)}
                </span>
            ) : (
                <BigTime
                    look={look}
                    time={session.time}
                    className={cn(
                        "pt-0.5",
                        look === "live" ? "text-[22px]" : "text-[20px]",
                    )}
                />
            )}
            <div className="grid min-w-0 gap-0.5">
                <span
                    className={cn(
                        "text-site-fg leading-tight [overflow-wrap:anywhere]",
                        look === "live" &&
                            "font-site-body text-[14px] font-bold",
                        look === "folio" &&
                            "font-site-heading text-[19px] font-light",
                        look === "quiet" &&
                            "font-site-heading text-[19px] font-normal",
                    )}
                >
                    {session.serviceName}
                </span>
                {look === "live" ? (
                    <LiveMeta session={session} words={words} />
                ) : (
                    <span className="text-site-muted text-[13px]">
                        {[formatDuration(session.durationMinutes), words.who]
                            .filter(Boolean)
                            .join(" · ")}
                    </span>
                )}
                {look !== "live" && words.price ? (
                    <span
                        data-timetable-price=""
                        className="text-site-fg text-[13px] font-semibold tabular-nums"
                    >
                        {words.price}
                    </span>
                ) : null}
                <Places line={words.places} look={look} />
                {look === "folio" ? null : (
                    <Action
                        look={look}
                        session={session}
                        show={show}
                        className="mt-1 justify-self-start"
                    />
                )}
            </div>
            {look === "folio" ? (
                <Action look={look} session={session} show={show} />
            ) : null}
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
function Places({
    line,
    look,
}: {
    line: ReturnType<typeof placesLine>;
    look: LookId;
}) {
    return (
        <span
            data-timetable-places={line?.tone ?? ""}
            className={cn(
                "block font-semibold",
                // VB09's tag row: 24 tall, 12.5px.
                look === "live"
                    ? "min-h-[24px] text-[12.5px]"
                    : "min-h-[20px] text-[13px]",
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
            className={
                look === "folio"
                    ? // VA09: Book is an accent text link, 44 tall to tap.
                      cn(
                          "text-site-accent-text inline-flex min-h-11 items-center text-[13px] font-semibold underline underline-offset-4",
                          FRONT_RING,
                          className,
                      )
                    : frontButton(look, "outline", cn("px-5", className))
            }
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
    content,
    look,
    title,
    lede,
    failed = false,
    onRetry,
    children,
}: {
    /** The section's content, for its eyebrow. */
    content?: unknown;
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
                    <LookEyebrow content={content} look={look} />
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

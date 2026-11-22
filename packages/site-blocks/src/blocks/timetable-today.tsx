"use client";

import type { LookId } from "@saroh/block-contract";

import { dateIn } from "../booking-flow/model";
import { useBrowserNow } from "../lib/browser-now";
import { clockWords, timeWords } from "../lib/clock";
import type { PublicTimetable, TimetableSession } from "../lib/timetable-read";
import { dayLabel, sessionHref } from "../lib/timetable-read";
import { cn } from "../lib/utils";
import { placesLeftWords } from "../live/live-words";
import { ctaClasses } from "./cta";
import { FRONT_TYPE, FRONT_WRAP, frontButton, LookEyebrow } from "./look-front";
import type { TimetableShow } from "./timetable-look";
import { waitlistHref } from "./timetable-look";

/**
 * The Timetable's `today` layout (BLOCK-MAP §3 block 9, board LCTimetable
 * "Today"): the next four classes from now, for a home page, with "The
 * whole week" beside the title.
 *
 * TODAY IS WORKED OUT IN THE BROWSER (R18). The server, and so any cached
 * page, draws the week's first four classes by their dates ("Tue 17 Nov ·
 * 6:00 pm") with no Today, no Now and no class skipped. Once the browser
 * has read its clock, classes already started drop out, the first card is
 * always one you can still book, and the days read Today and Tomorrow.
 * The line that says so is polite live text, never assertive.
 *
 * Places speak from the section's own number (KD8, `placesFrom`), else the
 * live rule: "3 left", "Last place", "Full" with Join waitlist, "Open".
 */

/** The business's `YYYY-MM-DD` at `at`; null for a zone this browser can't read. */
export function dateOn(at: number, timeZone: string): string | null {
    try {
        return dateIn(new Date(at).toISOString(), timeZone);
    } catch {
        return null;
    }
}

/** "Now 4:10 pm" on the business's clock. */
export function nowWords(at: number, timeZone: string): string {
    try {
        return `Now ${timeWords(at, timeZone)}`;
    } catch {
        return `Now ${timeWords(at, undefined)}`;
    }
}

function nextDay(date: string): string {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}

/** "Today · 6:00 pm", "Tomorrow · 7:00 am", "Thu 19 Nov · 7:00 am". */
export function whenWords(s: TimetableSession, today: string | null): string {
    const time = clockWords(s.time);
    if (today !== null && s.date === today) return `Today · ${time}`;
    if (today !== null && s.date === nextDay(today))
        return `Tomorrow · ${time}`;
    return `${dayLabel(s.date)} · ${time}`;
}

/** The next `count` classes: from now once the browser knows it, else the week's first. */
export function nextClasses(
    sessions: readonly TimetableSession[],
    now: number | null,
    count = 4,
): TimetableSession[] {
    return [...sessions]
        .filter((s) => now === null || Date.parse(s.startAt) > now)
        .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
        .slice(0, count);
}

/**
 * What today is, in words, once the browser knows: "Closed today" for a
 * day with no classes at all, "No more classes today" after its last.
 */
export function todayLine(
    sessions: readonly TimetableSession[],
    today: string | null,
    now: number | null,
): string | null {
    if (today === null || now === null) return null;
    const todays = sessions.filter((s) => s.date === today);
    if (todays.length === 0) return "Closed today";
    if (todays.every((s) => Date.parse(s.startAt) <= now)) {
        return "No more classes today";
    }
    return null;
}

/** The tag a card wears: a count only at or under the number, Full always. */
export function todayTag(
    s: Pick<TimetableSession, "placesLeft">,
    show: Pick<TimetableShow, "places" | "placesFrom">,
): { text: string; tone: "full" | "few" | "open" } | null {
    if (s.placesLeft <= 0) return { text: "Full", tone: "full" };
    if (!show.places) return null;
    const words = placesLeftWords(s.placesLeft, {
        short: true,
        from: show.placesFrom,
    });
    return words
        ? { text: words, tone: "few" }
        : { text: "Open", tone: "open" };
}

const TAG: Record<"full" | "few" | "open", string> = {
    full: "text-site-fg",
    few: "text-site-accent-text",
    open: "text-site-muted",
};

const CARD: Record<LookId | "classic", string> = {
    classic:
        "border-site-border bg-site-surface rounded-[calc(var(--site-radius)*1.4)] border p-[18px]",
    live: "bg-site-surface rounded-site-photo p-4",
    folio: "border-site-border border-t pt-4",
    quiet: "border-site-border border-t pt-4",
};

export function TimetableToday({
    content,
    look,
    title,
    lede,
    week,
    show,
    now: pinned,
    clock = true,
}: {
    /** False: a sample week, never read against today's clock. */
    clock?: boolean;
    /** The section's content, for a look's eyebrow. */
    content?: unknown;
    /** Absent: Classic. */
    look?: LookId;
    title: string;
    lede: string | null;
    week: PublicTimetable;
    show: TimetableShow;
    /** The moment "now" is, for fixtures and tests. */
    now?: Date;
}) {
    const browserNow = useBrowserNow(pinned);
    const now = clock ? browserNow : null;
    const today = now === null ? null : dateOn(now, week.timezone);
    const next = nextClasses(week.sessions, now);
    const line = todayLine(week.sessions, today, now);
    const key = look ?? "classic";
    const button = (kind: "outline" | "quiet") =>
        look ? frontButton(look, kind, "px-4") : ctaClasses("secondary");
    const wholeWeek = show.bookHref ? (
        <a
            href={show.bookHref}
            className="text-site-accent-text focus-visible:ring-site-accent focus-visible:ring-offset-site-bg inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
            The whole week
            <span aria-hidden="true">→</span>
        </a>
    ) : null;
    return (
        <section
            data-timetable-today=""
            data-site-look-timetable={look}
            className={cn(
                "text-site-fg w-full py-[var(--site-section-padding)]",
                !look &&
                    "mx-auto max-w-screen-xl px-5 sm:px-[var(--site-page-margin)]",
            )}
        >
            <div className={look ? FRONT_WRAP : undefined}>
                <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 pb-5">
                    <div className="grid min-w-0 gap-2">
                        {look ? (
                            <LookEyebrow content={content} look={look} />
                        ) : null}
                        <h2
                            data-site-title=""
                            className={
                                look
                                    ? FRONT_TYPE[look].h2
                                    : "font-site-heading text-[calc(1.625rem*var(--site-heading-scale))] font-semibold tracking-[-0.01em]"
                            }
                        >
                            {title}
                        </h2>
                        {lede ? (
                            <p className="text-site-body max-w-[60ch] text-[15px] leading-relaxed">
                                {lede}
                            </p>
                        ) : null}
                    </div>
                    {wholeWeek}
                </div>
                {/* Its height kept, so nothing moves when the clock is read. */}
                <p className="text-site-muted flex min-h-[24px] flex-wrap items-center gap-x-3 pb-3 text-[14px]">
                    {now !== null ? (
                        <span
                            aria-hidden="true"
                            data-timetable-now=""
                            className="bg-site-accent text-site-accent-fg rounded-[var(--site-tag-radius,4px)] px-2 py-0.5 text-[12px] font-bold tabular-nums"
                        >
                            {nowWords(now, week.timezone)}
                        </span>
                    ) : null}
                    <span role="status" aria-live="polite" aria-atomic="true">
                        {line ?? ""}
                    </span>
                </p>
                {next.length === 0 ? (
                    <p className="text-site-body text-[15px]">
                        No more classes this week.
                    </p>
                ) : (
                    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {next.map((s) => {
                            const tag = todayTag(s, show);
                            const full = s.placesLeft <= 0;
                            const who = show.trainer
                                ? s.staffName?.trim()
                                : null;
                            const label = `${s.serviceName}, ${dayLabel(s.date, true)} at ${clockWords(s.time)}`;
                            return (
                                <li
                                    key={`${s.serviceId}:${s.startAt}`}
                                    data-timetable-row=""
                                    data-timetable-full={full ? "" : undefined}
                                    className={cn(
                                        "grid min-w-0 content-start gap-1",
                                        CARD[key],
                                    )}
                                >
                                    <span className="text-site-accent-text text-[14px] font-semibold tabular-nums">
                                        {whenWords(s, today)}
                                    </span>
                                    <h3
                                        className={cn(
                                            "[overflow-wrap:anywhere]",
                                            look
                                                ? FRONT_TYPE[look].name
                                                : "font-site-heading text-site-fg text-[20px] leading-tight",
                                        )}
                                    >
                                        {s.serviceName}
                                    </h3>
                                    <span className="text-site-muted text-[14px]">
                                        {who
                                            ? `${who} · ${s.durationMinutes} min`
                                            : `${s.durationMinutes} min`}
                                    </span>
                                    <span className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                        <span
                                            data-timetable-places={
                                                tag?.tone ?? ""
                                            }
                                            className={cn(
                                                "text-[13px] font-semibold",
                                                tag && TAG[tag.tone],
                                            )}
                                        >
                                            {tag?.text ?? ""}
                                        </span>
                                        {!show.bookHref ? null : full ? (
                                            s.capacity > 1 ? (
                                                <a
                                                    href={waitlistHref(
                                                        show.bookHref,
                                                        s,
                                                    )}
                                                    aria-label={`Join the waitlist: ${label}`}
                                                    className={button("quiet")}
                                                >
                                                    Join waitlist
                                                </a>
                                            ) : null
                                        ) : (
                                            <a
                                                href={sessionHref(
                                                    show.bookHref,
                                                    s,
                                                )}
                                                aria-label={`Book ${label}`}
                                                className={button("outline")}
                                            >
                                                Book
                                            </a>
                                        )}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </section>
    );
}

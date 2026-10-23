"use client";

import { useCallback, useEffect, useState } from "react";

import type { LookId, RenderedTimetable } from "@saroh/block-contract";
import { resolveVariant } from "@saroh/block-contract";

import { DEFAULT_API_URL } from "../api-url";
import type { CreditFor } from "../booking-flow/api";
import { clockWords } from "../lib/clock";
import type {
    PlacesWord,
    PublicTimetable,
    TimetableSession,
} from "../lib/timetable-read";
import {
    dayLabel,
    fills,
    isPublicTimetable,
    isWeekday,
    placesWord,
    sessionHref,
    timetableQuery,
    weekCounts,
} from "../lib/timetable-read";
import { cn } from "../lib/utils";
import { showsCount } from "../live/live-state";
import { checkedWords } from "../live/live-words";
import { refreshLiveRead, useLiveRead } from "../live/use-live-read";
import type { LookProps } from "../look-context";
import { LookTimetable, LookTimetableNote } from "./timetable-look";

/**
 * `timetable` v1 — the week's class sessions, read live (industry templates
 * U2), as the gym design draws its week.
 *
 *   GET ${apiUrl}/public/sites/:siteId/timetable[?services=a,b]
 *
 * The sessions are the booking page's own for seven days, so every one here
 * is one the booking page offers. Each says its class, who takes it and its
 * places — "Full" and "Fills fast · 2 left" in WORDS, never colour alone —
 * and a session with a place is a link into the booking page with that
 * class, day and time chosen. A full one is listed and not a link.
 *
 * Looks: `grid` — days across and times down from the large breakpoint, day
 * by day below it (the same list as `list`), so a phone never scrolls
 * sideways; `list` — day by day at every width; `accent` (template polish)
 * — the grid with the sessions that fill set on the accent and still saying
 * "Fills fast" or "Full" in words, times in the mono face.
 *
 * `weekdaysOnly` leaves the weekend off; `showCounts` opens the line under
 * the title with "13 sessions across 5 days", counted from the week shown,
 * and gives the accent look a key for its filled cells.
 *
 * - no sessions this week, Appointments off, or a live render that could
 *   not tell its site: the block renders NOTHING;
 * - the read fails: the block's own error state, with a retry;
 * - `siteId` undefined (the editor's canvas with no site live): it says what
 *   will show, instead of inventing classes;
 * - `timetable` given: drawn without a fetch (catalog, tests).
 *
 * UNDER A LOOK (DEC-172, U7) the week is the look's (`timetable-look.tsx`):
 * every row with its price and an outline Book of 44px, places left only
 * when 5 or fewer, and Join the waitlist on a full class. Classic draws
 * exactly as before.
 *
 * Drawn from `--site-*` only; gates G2 and G7 fail the build otherwise.
 */

/** What the section is called when the merchant left the title empty. */
export const TIMETABLE_TITLE = "This week";

type LoadState =
    | { kind: "loading" }
    | { kind: "ready"; timetable: PublicTimetable }
    | { kind: "error" };

function said(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" ? null : trimmed;
}

type TimetableProps = LookProps & {
    /**
     * Under a look, the signed-in customer's class credit, read in the
     * browser with their session (the booking page's own read), so a row
     * their pack covers says "1 pack class" (U7). Absent: prices only.
     */
    credit?: CreditFor;
    content: RenderedTimetable;
    siteId?: string | null;
    apiUrl?: string;
    /** The site's booking page. Without one, sessions are not links. */
    bookHref?: string;
    /** A sample week to draw instead of fetching (catalog, tests). */
    timetable?: PublicTimetable;
};

/**
 * The block. Under a look on a live site the week is a live fact (U8's
 * `useLiveRead`: one read per page, read again while in view, counts
 * only while fresh); otherwise it is read as it always was.
 */
export default function TimetableSection(props: TimetableProps) {
    if (props.look && typeof props.siteId === "string" && !props.timetable) {
        return (
            <LiveLookTimetable
                {...props}
                look={props.look}
                siteId={props.siteId}
            />
        );
    }
    return <TimetableBlock {...props} />;
}

/** The week a section shows: Monday to Friday when it says so. */
function shownWeek(
    content: RenderedTimetable,
    timetable: PublicTimetable,
): { week: PublicTimetable; days: string[] } {
    const week: PublicTimetable =
        content.weekdaysOnly === true
            ? {
                  ...timetable,
                  days: timetable.days.filter(isWeekday),
                  sessions: timetable.sessions.filter((s) => isWeekday(s.date)),
              }
            : timetable;
    const days = week.days.length > 0 ? week.days : uniqueDays(week.sessions);
    return { week, days };
}

/** The line under a look's title: the week's count and the merchant's. */
function lookLede(
    content: RenderedTimetable,
    week: PublicTimetable,
): string | null {
    const counts = content.showCounts ? weekCounts(week.sessions) : null;
    const lede = [counts ? `${counts.line}.` : null, said(content.intro)]
        .filter(Boolean)
        .join(" ");
    return lede || null;
}

/**
 * A look's week on a live site, read in the browser as a live fact. The
 * server and the first paint draw "loading" (the cached page holds no
 * session, no count and no pack words); places left show only while the
 * answer is under a minute old, with when they were checked.
 */
function LiveLookTimetable({
    content,
    siteId,
    apiUrl = DEFAULT_API_URL,
    bookHref,
    look,
    credit,
}: TimetableProps & { look: LookId; siteId: string }) {
    const url = `${apiUrl}/public/sites/${encodeURIComponent(siteId)}/timetable${timetableQuery(content.serviceIds)}`;
    const read = useLiveRead(url, parseTimetable);
    const title = said(content.title) ?? TIMETABLE_TITLE;
    if (read.data === undefined) {
        return read.status === "failed" ? (
            <LookTimetableNote
                content={content}
                look={look}
                title={title}
                lede={said(content.intro)}
                failed
                onRetry={() => refreshLiveRead(url)}
            >
                We couldn&apos;t load this week&apos;s classes right now.
            </LookTimetableNote>
        ) : (
            <LookTimetableNote
                content={content}
                look={look}
                title={title}
                lede={said(content.intro)}
            >
                Loading this week&apos;s classes…
            </LookTimetableNote>
        );
    }
    const { week, days } = shownWeek(content, read.data);
    if (week.sessions.length === 0) return null;
    const counts = showsCount(read.status);
    return (
        <LookTimetable
            content={content}
            look={look}
            title={title}
            lede={lookLede(content, week)}
            week={week}
            days={days}
            show={{
                trainer: content.showTrainer !== false,
                // A count only while the answer is fresh (U8).
                places: content.showPlacesLeft !== false && counts,
                bookHref,
            }}
            checked={
                counts && read.fetchedAt !== undefined
                    ? `Places ${checkedWords(read.fetchedAt, week.timezone).toLowerCase()}`
                    : null
            }
            credit={credit}
        />
    );
}

function parseTimetable(body: unknown): PublicTimetable | undefined {
    return isPublicTimetable(body) ? body : undefined;
}

function TimetableBlock({
    content,
    siteId,
    apiUrl = DEFAULT_API_URL,
    bookHref,
    timetable: given,
    look: siteLook,
    credit,
}: TimetableProps) {
    const query = timetableQuery(content.serviceIds);
    const [state, setState] = useState<LoadState>(
        given ? { kind: "ready", timetable: given } : { kind: "loading" },
    );

    const load = useCallback(async (): Promise<LoadState> => {
        if (!siteId) return { kind: "error" };
        try {
            const res = await fetch(
                `${apiUrl}/public/sites/${encodeURIComponent(siteId)}/timetable${query}`,
                { headers: { accept: "application/json" } },
            );
            if (!res.ok) return { kind: "error" };
            const body: unknown = await res.json().catch(() => null);
            return isPublicTimetable(body)
                ? { kind: "ready", timetable: body }
                : { kind: "error" };
        } catch {
            return { kind: "error" };
        }
    }, [apiUrl, siteId, query]);

    useEffect(() => {
        if (given || !siteId) return;
        let active = true;
        void load().then((next) => {
            if (active) setState(next);
        });
        return () => {
            active = false;
        };
    }, [given, siteId, load]);

    const title = said(content.title) ?? TIMETABLE_TITLE;
    const intro = said(content.intro);

    if (!given && siteId === undefined) {
        return (
            <Frame title={title} intro={intro}>
                <Note>
                    This week&apos;s classes show here on your live site, with
                    who takes each and the places left.
                </Note>
            </Frame>
        );
    }
    if (!given && siteId === null) return null;
    if (state.kind === "loading") {
        return (
            <Frame title={title} intro={intro}>
                <Note busy>Loading this week&apos;s classes…</Note>
            </Frame>
        );
    }
    if (state.kind === "error") {
        return (
            <Frame title={title} intro={intro}>
                <Note
                    action={
                        <button
                            type="button"
                            onClick={() => {
                                setState({ kind: "loading" });
                                void load().then(setState);
                            }}
                            className={textButton}
                        >
                            Try again
                        </button>
                    }
                >
                    We couldn&apos;t load this week&apos;s classes right now.
                </Note>
            </Frame>
        );
    }

    const look = resolveVariant("timetable", content);
    // Monday to Friday only (template polish): the weekend left off.
    const { week, days } = shownWeek(content, state.timetable);
    if (week.sessions.length === 0) return null;
    const accent = look === "accent";
    const show: Show = {
        trainer: content.showTrainer !== false,
        places: content.showPlacesLeft !== false,
        bookHref,
        accent,
    };
    const grid = look === "grid" || accent;
    const counts = content.showCounts ? weekCounts(week.sessions) : null;

    if (siteLook) {
        return (
            <LookTimetable
                content={content}
                look={siteLook}
                title={title}
                lede={lookLede(content, week)}
                week={week}
                days={days}
                show={{
                    trainer: show.trainer,
                    places: show.places,
                    bookHref,
                }}
                credit={credit}
            />
        );
    }

    return (
        <Frame
            title={title}
            intro={intro}
            counts={counts?.line ?? null}
            legend={
                accent && counts && counts.filling > 0
                    ? `${counts.filling} of them fill fast`
                    : null
            }
        >
            {grid ? (
                <>
                    <div className="hidden lg:block">
                        <WeekGrid days={days} week={week} show={show} />
                    </div>
                    <div className="lg:hidden">
                        <DayList days={days} week={week} show={show} />
                    </div>
                </>
            ) : (
                <DayList days={days} week={week} show={show} />
            )}
        </Frame>
    );
}

interface Show {
    trainer: boolean;
    places: boolean;
    bookHref?: string;
    /** The accent look (template polish): filling sessions on the accent. */
    accent?: boolean;
}

function uniqueDays(sessions: TimetableSession[]): string[] {
    return Array.from(new Set(sessions.map((s) => s.date))).sort();
}

const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg";

const textButton = cn(
    "cursor-pointer rounded-[var(--site-radius)] text-sm font-semibold text-site-accent-text underline-offset-4 hover:underline",
    focusRing,
);

function Frame({
    title,
    intro,
    counts = null,
    legend = null,
    children,
}: {
    title: string;
    intro: string | null;
    /** "13 sessions across 5 days", counted from the week (template polish). */
    counts?: string | null;
    /** The accent look's key: a swatch and "4 of them fill fast". */
    legend?: string | null;
    children: React.ReactNode;
}) {
    const lede =
        counts || intro ? (
            <p className="text-site-body mt-1.5 max-w-[60ch] text-[15px] leading-relaxed">
                {counts ? `${counts}.` : null}
                {counts && intro ? " " : null}
                {intro}
            </p>
        ) : null;
    return (
        <section className="text-site-fg mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            <h2
                data-site-title=""
                className="font-site-heading text-[calc(1.625rem*var(--site-heading-scale))] font-semibold tracking-[-0.01em]"
            >
                {title}
            </h2>
            {legend ? (
                <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                    {lede ?? <span />}
                    <p
                        data-timetable-legend=""
                        className="text-site-body flex items-center gap-2 text-[13px]"
                    >
                        <span
                            aria-hidden="true"
                            className="bg-site-accent inline-block size-[11px] shrink-0"
                        />
                        {legend}
                    </p>
                </div>
            ) : (
                lede
            )}
            <div className="mt-4">{children}</div>
        </section>
    );
}

function Note({
    busy = false,
    action,
    children,
}: {
    busy?: boolean;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div
            role={action ? "alert" : "status"}
            aria-busy={busy || undefined}
            className="border-site-border text-site-body grid justify-items-start gap-2 rounded-[calc(var(--site-radius)*1.4)] border border-dashed p-5 text-sm leading-relaxed"
        >
            <p>{children}</p>
            {action ?? null}
        </div>
    );
}

const TONE: Record<PlacesWord["tone"], string> = {
    full: "border-site-border text-site-muted border",
    filling:
        "bg-[color-mix(in_srgb,hsl(var(--site-accent))_16%,hsl(var(--site-surface)))] text-site-fg",
    open: "bg-[color-mix(in_srgb,hsl(var(--site-fg))_7%,hsl(var(--site-surface)))] text-site-fg",
};

function Places({
    word,
    onAccent = false,
}: {
    word: PlacesWord | null;
    /** On an accent cell: the words in the accent's text colour, no pill. */
    onAccent?: boolean;
}) {
    if (!word) return null;
    if (onAccent) {
        return (
            <span className="text-site-accent-fg inline-block whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.08em]">
                {word.text}
            </span>
        );
    }
    return (
        <span
            className={cn(
                "inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-bold",
                TONE[word.tone],
            )}
        >
            {word.text}
        </span>
    );
}

/** One session: its class, who takes it and its places; a link if bookable. */
function Session({
    session,
    show,
    withTime,
}: {
    session: TimetableSession;
    show: Show;
    withTime: boolean;
}) {
    // The accent look (template polish) always says Fills fast or Full on
    // a filling cell, whatever "places left" says: the colour is never the
    // only signal.
    const lit = show.accent === true && fills(session);
    const word = placesWord(session, show.places || lit);
    const full = session.placesLeft <= 0;
    const trainer = show.trainer ? said(session.staffName) : null;
    const body = (
        <>
            {withTime ? (
                <span
                    className={
                        show.accent
                            ? cn(
                                  "font-site-mono whitespace-nowrap text-[13px] tabular-nums",
                                  lit
                                      ? "text-site-accent-fg"
                                      : "text-site-muted",
                              )
                            : "font-site-heading whitespace-nowrap text-[15px] font-semibold tabular-nums"
                    }
                >
                    {clockWords(session.time)}
                </span>
            ) : null}
            <span className="min-w-0">
                <span className="block text-[14.5px] font-semibold leading-snug [overflow-wrap:anywhere]">
                    {session.serviceName}
                </span>
                <span
                    className={cn(
                        "block text-[12.5px]",
                        lit ? "text-site-accent-fg" : "text-site-muted",
                    )}
                >
                    {trainer
                        ? `With ${trainer} · ${session.durationMinutes} min`
                        : `${session.durationMinutes} min`}
                </span>
            </span>
            <span>
                <Places word={word} onAccent={lit} />
            </span>
        </>
    );
    const layout = withTime
        ? "grid grid-cols-[4.75rem_minmax(0,1fr)_auto] items-center gap-3"
        : "grid gap-1.5";
    const box = lit
        ? cn(
              "bg-site-accent text-site-accent-fg rounded-[var(--site-radius)] border border-transparent p-2.5",
              layout,
          )
        : cn(
              "border-site-border bg-site-surface text-site-fg rounded-[var(--site-radius)] border p-2.5",
              layout,
          );
    if (full || !show.bookHref) {
        return <div className={box}>{body}</div>;
    }
    return (
        <a
            href={sessionHref(show.bookHref, session)}
            className={cn(
                box,
                "hover:border-site-fg/40 cursor-pointer transition-colors",
                focusRing,
            )}
        >
            {body}
            <span className="sr-only">
                {`, book ${dayLabel(session.date, true)} at ${clockWords(session.time)}`}
            </span>
        </a>
    );
}

/** Day by day: each day's heading, then its classes. Days with none say so. */
function DayList({
    days,
    week,
    show,
}: {
    days: string[];
    week: PublicTimetable;
    show: Show;
}) {
    return (
        <div className="grid gap-5">
            {days.map((date) => {
                const sessions = week.sessions.filter((s) => s.date === date);
                return (
                    <section key={date} aria-label={dayLabel(date, true)}>
                        <h3 className="font-site-heading border-site-border mb-2 border-b pb-1.5 text-[17px] font-semibold">
                            {dayLabel(date, true)}
                        </h3>
                        {sessions.length > 0 ? (
                            <ul className="grid gap-2">
                                {sessions.map((s) => (
                                    <li key={`${s.serviceId}:${s.startAt}`}>
                                        <Session
                                            session={s}
                                            show={show}
                                            withTime
                                        />
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-site-muted text-sm">
                                No classes.
                            </p>
                        )}
                    </section>
                );
            })}
        </div>
    );
}

/**
 * Days across, times down: a real table, so a screen reader announces the
 * day and the time of each class with it.
 */
function WeekGrid({
    days,
    week,
    show,
}: {
    days: string[];
    week: PublicTimetable;
    show: Show;
}) {
    const times = Array.from(new Set(week.sessions.map((s) => s.time))).sort();
    return (
        <table className="w-full table-fixed border-separate border-spacing-1.5 text-left">
            <caption className="sr-only">
                Classes this week, by day and time
            </caption>
            <thead>
                <tr>
                    <td className="w-20" />
                    {days.map((date) => (
                        <th
                            key={date}
                            scope="col"
                            className="text-site-muted pb-1 text-[12.5px] font-bold uppercase tracking-[0.06em]"
                        >
                            {dayLabel(date)}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {times.map((time) => (
                    <tr key={time}>
                        <th
                            scope="row"
                            className={
                                show.accent
                                    ? "font-site-mono text-site-muted whitespace-nowrap pr-1 pt-3 text-right align-top text-[12.5px] font-normal tabular-nums"
                                    : "font-site-heading whitespace-nowrap pr-1 align-top text-[15px] font-semibold tabular-nums"
                            }
                        >
                            {clockWords(time)}
                        </th>
                        {days.map((date) => {
                            const here = week.sessions.filter(
                                (s) => s.date === date && s.time === time,
                            );
                            return (
                                <td key={date} className="align-top">
                                    <div className="grid gap-1.5">
                                        {here.map((s) => (
                                            <Session
                                                key={`${s.serviceId}:${s.startAt}`}
                                                session={s}
                                                show={show}
                                                withTime={false}
                                            />
                                        ))}
                                    </div>
                                </td>
                            );
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

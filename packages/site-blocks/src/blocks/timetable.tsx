"use client";

import { useCallback, useEffect, useState } from "react";

import type { RenderedTimetable } from "@saroh/block-contract";
import { resolveVariant } from "@saroh/block-contract";

import { DEFAULT_API_URL } from "../api-url";
import type {
    PlacesWord,
    PublicTimetable,
    TimetableSession,
} from "../lib/timetable-read";
import {
    dayLabel,
    isPublicTimetable,
    placesWord,
    sessionHref,
    timetableQuery,
} from "../lib/timetable-read";
import { cn } from "../lib/utils";

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
 * sideways; `list` — day by day at every width.
 *
 * - no sessions this week, Appointments off, or a live render that could
 *   not tell its site: the block renders NOTHING;
 * - the read fails: the block's own error state, with a retry;
 * - `siteId` undefined (the editor's canvas with no site live): it says what
 *   will show, instead of inventing classes;
 * - `timetable` given: drawn without a fetch (catalog, tests).
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

export default function TimetableSection({
    content,
    siteId,
    apiUrl = DEFAULT_API_URL,
    bookHref,
    timetable: given,
}: {
    content: RenderedTimetable;
    siteId?: string | null;
    apiUrl?: string;
    /** The site's booking page. Without one, sessions are not links. */
    bookHref?: string;
    /** A sample week to draw instead of fetching (catalog, tests). */
    timetable?: PublicTimetable;
}) {
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

    const week = state.timetable;
    if (week.sessions.length === 0) return null;
    const show: Show = {
        trainer: content.showTrainer !== false,
        places: content.showPlacesLeft !== false,
        bookHref,
    };
    const grid = resolveVariant("timetable", content) === "grid";
    const days = week.days.length > 0 ? week.days : uniqueDays(week.sessions);

    return (
        <Frame title={title} intro={intro}>
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
}

function uniqueDays(sessions: TimetableSession[]): string[] {
    return Array.from(new Set(sessions.map((s) => s.date))).sort();
}

const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg";

const textButton = cn(
    "cursor-pointer rounded-[var(--site-radius)] text-sm font-semibold text-site-accent underline-offset-4 hover:underline",
    focusRing,
);

function Frame({
    title,
    intro,
    children,
}: {
    title: string;
    intro: string | null;
    children: React.ReactNode;
}) {
    return (
        <section className="text-site-fg mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            <h2 className="font-site-heading text-[calc(1.625rem*var(--site-heading-scale))] font-semibold tracking-[-0.01em]">
                {title}
            </h2>
            {intro ? (
                <p className="text-site-body mt-1.5 max-w-[60ch] text-[15px] leading-relaxed">
                    {intro}
                </p>
            ) : null}
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

function Places({ word }: { word: PlacesWord | null }) {
    if (!word) return null;
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
    const word = placesWord(session, show.places);
    const full = session.placesLeft <= 0;
    const trainer = show.trainer ? said(session.staffName) : null;
    const body = (
        <>
            {withTime ? (
                <span className="font-site-heading text-[15px] font-semibold tabular-nums">
                    {session.time}
                </span>
            ) : null}
            <span className="min-w-0">
                <span className="block text-[14.5px] font-semibold leading-snug [overflow-wrap:anywhere]">
                    {session.serviceName}
                </span>
                <span className="text-site-muted block text-[12.5px]">
                    {trainer
                        ? `With ${trainer} · ${session.durationMinutes} min`
                        : `${session.durationMinutes} min`}
                </span>
            </span>
            <span>
                <Places word={word} />
            </span>
        </>
    );
    const layout = withTime
        ? "grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3"
        : "grid gap-1.5";
    const box = cn(
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
                {`, book ${dayLabel(session.date, true)} at ${session.time}`}
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
                    <td className="w-16" />
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
                            className="font-site-heading pr-1 align-top text-[15px] font-semibold tabular-nums"
                        >
                            {time}
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

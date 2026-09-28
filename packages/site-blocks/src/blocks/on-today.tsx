"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { RenderedHero } from "@saroh/block-contract";

import { DEFAULT_API_URL } from "../api-url";
import { dateText } from "../booking-flow/model";
import type { OpeningHoursDay } from "../lib/opening-hours";
import { isOpeningWeek, openState, openStateText } from "../lib/opening-hours";
import { cn } from "../lib/utils";
import { CtaButton } from "./cta";
import PlainHero from "./hero-plain";

/**
 * The hero with "On today" beside it (G18, R15), as the Customer Site design
 * draws the home page: the headline, its button and "Open now · closes 9pm"
 * on one side; today's next classes with places and next free appointment
 * times on the other, each a link into the booking page with that time
 * chosen. The hero's photo moves below the two.
 *
 * Read live, when the page is viewed:
 *
 *   GET ${apiUrl}/public/sites/:siteId/today
 *
 * The times are the booking page's own (that read lists what the booking
 * page's days return, with no rounding), so a time here is always one the
 * booking page offers. And so:
 * - a business without Appointments, or with nothing on its booking page,
 *   gets no panel: the hero stays as it always was (default 138);
 * - the read fails: the hero without the panel, never an empty "nothing on";
 * - nothing left today: "Nothing more today · See tomorrow";
 * - no hours saved: no open-or-closed line, never "Closed" (a claim the
 *   business never made).
 *
 * `today` skips the fetch (catalog, tests). `siteId` undefined means no site
 * is live here (the editor's canvas without one); the panel then says what
 * it will show instead of inventing times.
 *
 * Drawn from `--site-*` only; gates G2 and G7 fail the build otherwise.
 */

/** One row of On today, as the public read returns it. */
export interface PublicTodayItem {
    kind: "class" | "one";
    serviceId: string;
    serviceName: string;
    durationMinutes: number;
    startAt: string;
    /** `YYYY-MM-DD` in the business's zone. */
    date: string;
    /** `HH:MM` in the business's zone. */
    time: string;
    staffName: string | null;
    placesLeft: number | null;
}

/** What the public today read returns (G18). */
export interface PublicToday {
    timezone: string;
    date: string;
    appointments: boolean;
    classes: boolean;
    items: PublicTodayItem[];
    hours: OpeningHoursDay[] | null;
    closedDates: string[];
}

function isTodayItem(value: unknown): value is PublicTodayItem {
    if (typeof value !== "object" || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
        (v.kind === "class" || v.kind === "one") &&
        typeof v.serviceId === "string" &&
        typeof v.serviceName === "string" &&
        typeof v.durationMinutes === "number" &&
        typeof v.startAt === "string" &&
        typeof v.date === "string" &&
        typeof v.time === "string" &&
        (v.staffName === null || typeof v.staffName === "string") &&
        (v.placesLeft === null || typeof v.placesLeft === "number")
    );
}

/** Narrowed, not cast (#264). */
export function isPublicToday(value: unknown): value is PublicToday {
    if (typeof value !== "object" || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
        typeof v.timezone === "string" &&
        typeof v.date === "string" &&
        typeof v.appointments === "boolean" &&
        typeof v.classes === "boolean" &&
        Array.isArray(v.items) &&
        v.items.every(isTodayItem) &&
        (v.hours === null || isOpeningWeek(v.hours)) &&
        Array.isArray(v.closedDates) &&
        v.closedDates.every((d) => typeof d === "string")
    );
}

/**
 * Where a row goes: the booking page, on that service and day with that
 * time chosen (`?service=&date=&start=`). If the time has gone by then, the
 * booking page opens on the day and says so.
 */
export function todayHref(bookHref: string, item: PublicTodayItem): string {
    const q = new URLSearchParams({
        service: item.serviceId,
        date: item.date,
        start: item.time,
    });
    return `${bookHref}?${q.toString()}`;
}

/** The row's second line: who, and how long. Display names only (ADR-008). */
function subLine(item: PublicTodayItem): string {
    const length = `${item.durationMinutes} min`;
    if (item.kind === "class") {
        return item.staffName ? `With ${item.staffName}` : length;
    }
    return item.staffName ? `${item.staffName} · ${length}` : length;
}

interface Tag {
    text: string;
    tone: "free" | "left" | "full";
}

function tagOf(item: PublicTodayItem): Tag {
    if (item.kind === "one") return { text: "Free", tone: "free" };
    const left = item.placesLeft ?? 0;
    return left > 0
        ? { text: `${left} left`, tone: "left" }
        : { text: "Full", tone: "full" };
}

/*
 * The design's pills are green for Free and red for Full. A merchant's page
 * has only its own palette, so: Free wears the accent, a class with places the
 * quiet fill, and Full reads muted — the word carries the meaning.
 */
const TAG_TONE: Record<Tag["tone"], string> = {
    free: "bg-[color-mix(in_srgb,hsl(var(--site-accent))_16%,hsl(var(--site-surface)))] text-site-fg",
    left: "bg-[color-mix(in_srgb,hsl(var(--site-fg))_7%,hsl(var(--site-surface)))] text-site-fg",
    full: "bg-[color-mix(in_srgb,hsl(var(--site-fg))_7%,hsl(var(--site-surface)))] text-site-muted",
};

type LoadState =
    | { kind: "loading" }
    | { kind: "ready"; today: PublicToday }
    | { kind: "error" };

export default function OnTodayHero({
    content,
    siteId,
    apiUrl = DEFAULT_API_URL,
    bookHref,
    today: given,
    now,
}: {
    content: RenderedHero;
    /**
     * The live site's id — the read resolves the business from it. `null`:
     * a live render that could not tell (the plain hero). Undefined: not a
     * live site at all (the editor canvas).
     */
    siteId?: string | null;
    /** Base URL of the public API. See {@link DEFAULT_API_URL}. */
    apiUrl?: string;
    /** The site's booking page. Without one, rows are not links. */
    bookHref?: string;
    /** A sample day to draw instead of fetching (catalog, tests). */
    today?: PublicToday;
    /** The moment "Open now" is worked out for. Tests pin it. */
    now?: Date;
}) {
    const [state, setState] = useState<LoadState>(
        given ? { kind: "ready", today: given } : { kind: "loading" },
    );

    useEffect(() => {
        if (given || !siteId) return;
        let active = true;
        void (async (): Promise<LoadState> => {
            try {
                const res = await fetch(
                    `${apiUrl}/public/sites/${encodeURIComponent(siteId)}/today`,
                    { headers: { accept: "application/json" } },
                );
                if (!res.ok) return { kind: "error" };
                const body: unknown = await res.json().catch(() => null);
                return isPublicToday(body)
                    ? { kind: "ready", today: body }
                    : { kind: "error" };
            } catch {
                return { kind: "error" };
            }
        })().then((next) => {
            if (active) setState(next);
        });
        return () => {
            active = false;
        };
    }, [apiUrl, given, siteId]);

    // Where no site is live (the editor's canvas): say what goes here.
    if (!given && siteId === undefined) {
        return (
            <SplitHero content={content} line={null}>
                <Panel title="On today" sub={null}>
                    <p className="border-site-border text-site-muted border-t px-1 py-3 text-[13.5px]">
                        Today&apos;s classes and free times show here on your
                        live site.
                    </p>
                </Panel>
            </SplitHero>
        );
    }
    // A live render that could not tell which site, or a failed read: the
    // hero without the panel — never an empty "nothing on".
    if (!given && siteId === null) return <PlainHero content={content} />;
    if (state.kind === "error") return <PlainHero content={content} />;

    if (state.kind === "loading") {
        return (
            <SplitHero content={content} line={null}>
                <Panel title="On today" sub={null}>
                    <p className="border-site-border text-site-muted border-t px-1 py-3 text-[13.5px]">
                        Loading today&apos;s times…
                    </p>
                </Panel>
            </SplitHero>
        );
    }

    const today = state.today;
    const status = openState(
        today.hours,
        now ?? new Date(),
        today.timezone,
        today.closedDates,
    );
    const line = status ? (
        <OpenLine text={openStateText(status)} open={status.open} />
    ) : null;

    // No Appointments, or nothing on the booking page: no panel (default 138).
    if (!today.appointments) {
        return <PlainHero content={content} below={line} />;
    }

    return (
        <SplitHero content={content} line={line}>
            <Panel
                title={today.classes ? "On today" : "Free today"}
                sub={dateText(today.date, true)}
            >
                {today.items.length > 0 ? (
                    <ul>
                        {today.items.map((item) => (
                            <li key={`${item.serviceId}:${item.startAt}`}>
                                <Row item={item} bookHref={bookHref} />
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="border-site-border text-site-muted border-t px-1 py-3 text-[13.5px]">
                        Nothing more today
                        {bookHref ? (
                            <>
                                {" · "}
                                <Link
                                    href={bookHref}
                                    className="text-site-fg focus-visible:ring-site-accent rounded-sm font-semibold underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2"
                                >
                                    See tomorrow
                                </Link>
                            </>
                        ) : null}
                    </p>
                )}
            </Panel>
        </SplitHero>
    );
}

/** "● Open now · closes 9pm" — the dot only while open, as drawn. */
function OpenLine({ text, open }: { text: string; open: boolean }) {
    return (
        <p className="mt-[18px] flex flex-wrap gap-x-4 gap-y-2 text-[13.5px] opacity-80">
            <span>
                {open ? <span aria-hidden="true">● </span> : null}
                {text}
            </span>
        </p>
    );
}

/**
 * The design's split hero: copy on the left, the panel on the right, the two
 * stacking below about 640px; the hero's photo, if it has one, below both.
 */
function SplitHero({
    content,
    line,
    children,
}: {
    content: RenderedHero;
    line: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section className="bg-site-hero-bg text-site-hero-fg mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            <div className="grid items-start gap-[22px] [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
                <div className="pt-2">
                    <h1 className="font-site-heading text-balance text-[clamp(calc(38px*var(--site-heading-scale)),9vw,calc(64px*var(--site-heading-scale)))] font-semibold leading-[1.02] tracking-[-0.035em]">
                        {content.heading}
                    </h1>
                    {content.subheading ? (
                        <p className="mt-3.5 max-w-[44ch] text-pretty text-base leading-[1.55] opacity-75">
                            {content.subheading}
                        </p>
                    ) : null}
                    {content.cta ? (
                        <div className="mt-[22px] flex flex-wrap gap-2.5">
                            <CtaButton content={content.cta} />
                        </div>
                    ) : null}
                    {line}
                </div>
                {children}
            </div>
            {content.image?.src ? (
                <div className="relative mt-[18px] aspect-[16/7] min-h-[180px] w-full">
                    {/* A plain <img>, as the hero always has: remote images
                        from any tenant origin. */}
                    <img
                        src={content.image.src}
                        alt={content.image.alt ?? ""}
                        width={content.image.width}
                        height={content.image.height}
                        className="absolute inset-0 size-full rounded-[calc(var(--site-radius)*1.6)] object-cover"
                    />
                </div>
            ) : null}
        </section>
    );
}

/** The card beside the headline. */
function Panel({
    title,
    sub,
    children,
}: {
    title: string;
    sub: string | null;
    children: React.ReactNode;
}) {
    return (
        <div className="bg-site-surface border-site-border text-site-fg rounded-[calc(var(--site-radius)+16px)] border px-4 pb-2.5 pt-4 shadow-[0_10px_30px_hsl(var(--site-fg)/0.06)]">
            <div className="mb-1.5 flex items-baseline gap-2">
                <h2 className="font-site-heading flex-1 text-[19px] font-semibold tracking-[-0.01em]">
                    {title}
                </h2>
                {sub ? (
                    <span className="text-site-muted text-[12.5px]">{sub}</span>
                ) : null}
            </div>
            {children}
        </div>
    );
}

/** One time: when, what and with whom, and a tag — a link when it can be. */
function Row({ item, bookHref }: { item: PublicTodayItem; bookHref?: string }) {
    const tag = tagOf(item);
    const body = (
        <>
            <span className="font-site-heading text-[15px] font-semibold tabular-nums">
                {item.time}
            </span>
            <span className="min-w-0">
                <span className="block truncate text-[14.5px] font-semibold">
                    {item.serviceName}
                </span>
                <span className="text-site-muted mt-px block text-[12.5px]">
                    {subLine(item)}
                </span>
            </span>
            <span
                className={cn(
                    "whitespace-nowrap rounded-full px-[9px] py-[3px] text-[11.5px] font-bold",
                    TAG_TONE[tag.tone],
                )}
            >
                {tag.text}
            </span>
        </>
    );
    const rowClass =
        "border-site-border text-site-fg grid w-full grid-cols-[58px_minmax(0,1fr)_auto] items-center gap-3 border-t px-1 py-[11px] text-left";
    if (!bookHref) return <div className={rowClass}>{body}</div>;
    return (
        <Link
            href={todayHref(bookHref, item)}
            className={cn(
                rowClass,
                "focus-visible:ring-site-accent hover:bg-[color-mix(in_srgb,hsl(var(--site-fg))_4%,hsl(var(--site-surface)))] focus-visible:outline-none focus-visible:ring-2",
            )}
        >
            {body}
        </Link>
    );
}

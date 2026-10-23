"use client";

import { useEffect, useState } from "react";

import type { LookId, RenderedVisitUs } from "@saroh/block-contract";
import { ctaHref } from "@saroh/block-contract";

import { DEFAULT_API_URL } from "../api-url";
import {
    openState,
    openStateText,
    weekdayIn,
    weekSummary,
} from "../lib/opening-hours";
import { phoneText } from "../lib/phone";
import type { PublicVisit } from "../lib/public-visit";
import { usePublicVisit } from "../lib/use-public-visit";
import { cn } from "../lib/utils";
import { LiveFact } from "../live/live-fact";
import type { LiveRead } from "../live/use-live-read";
import type { LookProps } from "../look-context";
import { LookIcon } from "../look-icons";
import { hoursRows } from "./hours";
import { FRONT_TYPE, FRONT_WRAP, frontButton } from "./look-front";

/**
 * `visitUs` v1 — one place's address, hours and phone, read live (G8).
 *
 * The section stores which storefront and two switches. Everything a visitor
 * reads comes from the public visit read when the page is viewed:
 *
 *   GET ${apiUrl}/public/sites/:siteId/visit/:storeId   — the chosen shop
 *   GET ${apiUrl}/public/sites/:siteId/visit            — no shop chosen
 *
 * The first serves a place only while it belongs to the site's business, is
 * a `SHOP` and is not closed. With no shop chosen the block reads the
 * business's own place (template polish), as Opening hours always has: its
 * first open shop, else the business profile's address and hours — so a
 * business with one place needs to choose nothing. So:
 * - the place is gone, closed or went online-only, or the business has no
 *   place at all: the block renders NOTHING rather than a card with no
 *   place in it;
 * - no hours saved: the hours line and "Open now" are left out, never
 *   "Closed" (a claim the business never made);
 * - no phone: no Call button;
 * - the request fails: the block's own error state, with a retry.
 *
 * `visit` skips the fetch — the catalog, the Add-block picker and the tests
 * pass a sample place, because a fixture's id belongs to no storefront.
 * `siteId` undefined means this is drawn where no site is live (the editor's
 * canvas); the block then says where the real values come from instead of
 * inventing them.
 *
 * Drawn from `--site-*` only; gates G2 and G7 fail the build otherwise.
 */

export { isPublicVisit } from "../lib/public-visit";
export type { PublicVisit } from "../lib/public-visit";

/** What the card says when the merchant left the title empty. */
export const VISIT_US_TITLE = "Come and see us";

/**
 * A maps search for the address — Get directions. Lines are split and
 * trimmed, as `contact` does, rather than a regex over whitespace.
 */
export function directionsHref(address: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        address
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .join(", "),
    )}`;
}

const noPage = () => undefined;

/** A value with something in it, else null: an empty string says nothing. */
function said(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" ? null : trimmed;
}

export default function VisitUsSection({
    content,
    siteId,
    apiUrl = DEFAULT_API_URL,
    visit: given,
    now,
    look,
}: LookProps & {
    content: RenderedVisitUs;
    /**
     * The live site's id — the read resolves the business from it. `null`:
     * a live render that could not tell (the block draws nothing).
     * Undefined: not a live site at all (the editor canvas).
     */
    siteId?: string | null;
    /** Base URL of the public API. See {@link DEFAULT_API_URL}. */
    apiUrl?: string;
    /** A sample place to draw instead of fetching (catalog, tests). */
    visit?: PublicVisit;
    /** The moment "Open now" is worked out for. Tests pin it. */
    now?: Date;
}) {
    const storeId = said(content.storeId);
    // The same read the Opening hours block makes: the chosen shop, or with
    // none the business's own place (template polish).
    const { state, retry } = usePublicVisit({
        siteId,
        storeId,
        apiUrl,
        given,
    });

    const title = said(content.title) ?? VISIT_US_TITLE;

    if (state.kind === "idle") {
        return (
            <Card look={look} title={title}>
                <p className="mt-1.5 text-sm leading-relaxed opacity-85">
                    {storeId
                        ? "The address, opening hours and phone of your shop show here on your live site."
                        : "Your business's address, opening hours and phone show here on your live site. Choose a shop to show that one instead."}
                </p>
            </Card>
        );
    }
    if (state.kind === "ready" && state.visit === null) return null;

    if (state.kind === "loading") {
        return (
            <Card look={look} title={title}>
                <p className="mt-1.5 text-sm opacity-85">
                    Loading our address and hours…
                </p>
            </Card>
        );
    }
    if (state.kind === "error") {
        return (
            <Card look={look} title={title}>
                <p role="alert" className="mt-1.5 text-sm opacity-85">
                    We couldn&apos;t load our address and hours right now.
                    Please try again shortly.
                </p>
                <div className="mt-4">
                    <button
                        type="button"
                        onClick={retry}
                        className={secondaryButton}
                    >
                        Try again
                    </button>
                </div>
            </Card>
        );
    }

    const place = state.visit;
    if (!place) return null;
    const showHours = content.showHours !== false;
    const hours = showHours ? weekSummary(place.hours) : null;
    const status = showHours
        ? // A closure day reads closed here as it does in the hero (G-2).
          openState(
              place.hours,
              now ?? new Date(),
              place.timezone,
              place.closedDates,
          )
        : null;
    const address = said(place.address);
    const directions =
        content.showMap !== false && address ? directionsHref(address) : null;
    const phone = said(place.phone);
    // A business's own place may be only a name (template polish): with no
    // address, hours or phone the card would say nothing.
    if (!address && !hours && !phone) return null;

    if (look) {
        return (
            <LookVisit
                look={look}
                title={title}
                address={address}
                week={showHours ? place.hours : null}
                timeZone={place.timezone}
                now={now}
                closedDates={place.closedDates ?? []}
                phone={phone}
                directions={directions}
            />
        );
    }

    return (
        <Card
            title={title}
            actions={
                phone || directions ? (
                    <div className="flex flex-wrap gap-2">
                        {phone ? (
                            <a
                                href={ctaHref(
                                    { kind: "call", number: phone },
                                    noPage,
                                )}
                                className={primaryButton}
                            >
                                Call {phoneText(phone)}
                            </a>
                        ) : null}
                        {directions ? (
                            <a
                                href={directions}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={secondaryButton}
                            >
                                Get directions
                            </a>
                        ) : null}
                    </div>
                ) : null
            }
        >
            {address || hours ? (
                <p className="mt-1.5 text-sm leading-relaxed opacity-85">
                    {address ? (
                        <span className="block whitespace-pre-line">
                            {address}
                        </span>
                    ) : null}
                    {hours ? <span className="block">{hours}</span> : null}
                </p>
            ) : null}
            {status ? (
                <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
                    <span
                        aria-hidden="true"
                        className={cn(
                            "inline-block size-2 rounded-full",
                            status.open ? "bg-site-accent" : "bg-site-bg/50",
                        )}
                    />
                    {openStateText(status)}
                </p>
            ) : null}
        </Card>
    );
}

/*
 * The design's card: the page's ink as the ground and its paper as the type,
 * the merchant's accent on the one button that matters. A button's radius is
 * the site's; the card's is a step rounder, so a square-cornered theme stays
 * square.
 */
const buttonBase =
    "inline-flex min-h-11 items-center rounded-[var(--site-radius)] px-4 text-[0.9rem] font-semibold transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:ring-offset-2 focus-visible:ring-offset-site-fg";
const primaryButton = cn(buttonBase, "bg-site-accent text-site-accent-fg");
const secondaryButton = cn(
    buttonBase,
    "border border-site-bg/35 bg-transparent text-site-bg",
);

/** The card, Classic's or, under a look, the look's frame. */
function Card({
    look,
    ...props
}: {
    look?: LookId;
    title: string;
    actions?: React.ReactNode;
    children: React.ReactNode;
}) {
    return look ? (
        <LookVisitFrame look={look} {...props} />
    ) : (
        <VisitCard {...props} />
    );
}

function VisitCard({
    title,
    actions,
    children,
}: {
    title: string;
    actions?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section className="mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            <div className="bg-site-fg text-site-bg grid items-center gap-4 rounded-[calc(var(--site-radius)*1.6)] p-[22px] [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
                <div className="min-w-0">
                    <h2
                        data-site-title=""
                        className="font-site-heading text-[calc(1.375rem*var(--site-heading-scale))] font-semibold tracking-[-0.01em]"
                    >
                        {title}
                    </h2>
                    {children}
                </div>
                {actions ?? null}
            </div>
        </section>
    );
}

/**
 * Visit us under a look (DEC-172, plan U7, #1096), as VA07, VD07 and VB07
 * draw the place: the title, the address in the look's display face, the
 * open line (its height kept, so nothing jumps while it is worked out),
 * the week's hours with today marked, and Get directions as an outline
 * with a map pin beside Call. No map: Get directions opens the visitor's
 * own maps (VA-28). Nothing here is filled: the page's one filled button
 * is elsewhere. Every target is 44px.
 */
function LookVisitFrame({
    look,
    title,
    actions,
    children,
}: {
    look: LookId;
    title: string;
    actions?: React.ReactNode;
    children: React.ReactNode;
}) {
    const type = FRONT_TYPE[look];
    return (
        <section
            data-site-look-visit={look}
            className="text-site-fg w-full py-[var(--site-section-padding)]"
        >
            <div className={FRONT_WRAP}>
                <div
                    className={cn(
                        "grid gap-6",
                        look === "live" &&
                            "bg-site-surface rounded-site-photo p-5 min-[700px]:p-8",
                    )}
                >
                    <div className="grid min-w-0 gap-3">
                        <h2 data-site-title="" className={type.h2}>
                            {title}
                        </h2>
                        <div className="text-site-body text-[16px] leading-relaxed">
                            {children}
                        </div>
                    </div>
                    {actions ?? null}
                </div>
            </div>
        </section>
    );
}

const SHORT_DAY: Record<string, string> = {
    MON: "Mon",
    TUE: "Tue",
    WED: "Wed",
    THU: "Thu",
    FRI: "Fri",
    SAT: "Sat",
    SUN: "Sun",
};

/** Visit us's measures per look, from boards VA07, VD01/VD07 and VB07. */
const VISIT: Record<
    LookId,
    { grid: string; hours: string; today: string; other: string }
> = {
    // VD: two halves 96px apart; hours in a 140px column, no rules.
    quiet: {
        grid: "grid gap-10 min-[1000px]:grid-cols-2 min-[1000px]:items-center min-[1000px]:gap-24",
        hours: "grid grid-cols-[140px_minmax(0,1fr)] gap-x-4 gap-y-2 text-[15.5px] tabular-nums",
        today: "text-site-fg font-medium",
        other: "text-site-body",
    },
    // VA: hours in a 110px column, 15px, today at 600.
    folio: {
        grid: "grid gap-10 min-[1000px]:grid-cols-2 min-[1000px]:gap-16",
        hours: "grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-1 text-[15px] tabular-nums",
        today: "text-site-fg font-semibold",
        other: "text-site-muted",
    },
    // VB: the place and the week as two cards.
    live: {
        grid: "grid gap-5 min-[1000px]:grid-cols-2",
        hours: "grid text-[14px] tabular-nums",
        today: "text-site-fg font-bold",
        other: "text-site-fg",
    },
};

function LookVisit({
    look,
    title,
    address,
    week,
    timeZone,
    now,
    closedDates,
    phone,
    directions,
}: {
    look: LookId;
    title: string;
    address: string | null;
    week: PublicVisit["hours"];
    timeZone: string;
    now?: Date;
    /** Days closed for the whole of their hours (E3). */
    closedDates: readonly string[];
    phone: string | null;
    directions: string | null;
}) {
    const type = FRONT_TYPE[look];
    const measure = VISIT[look];
    const rows = hoursRows(week, true);
    const today = rows ? weekdayIn(now ?? new Date(), timeZone) : null;
    const live = look === "live";
    const card = "bg-site-surface rounded-site-photo";
    const todayRow = rows?.find((r) => r.day === today);
    const open = (
        <OpenLine
            week={week}
            timeZone={timeZone}
            now={now}
            closedDates={closedDates}
            todayHours={
                todayRow
                    ? todayRow.hours
                        ? `Today: ${todayRow.hours}`
                        : "Closed today"
                    : null
            }
        />
    );
    // Quiet's title is the eyebrow and the address its heading (VD01).
    const head =
        look === "quiet" && address ? (
            <>
                <p data-site-title="" className={type.eyebrow}>
                    {title}
                </p>
                <h2
                    data-visit-address=""
                    className={cn(type.h2, "whitespace-pre-line")}
                >
                    {address}
                </h2>
            </>
        ) : (
            <>
                <h2 data-site-title="" className={type.h2}>
                    {title}
                </h2>
                {address ? (
                    <p
                        data-visit-address=""
                        className={cn(
                            live
                                ? "text-site-fg text-[18px] font-bold leading-snug"
                                : type.name,
                            "whitespace-pre-line [overflow-wrap:anywhere]",
                        )}
                    >
                        {address}
                    </p>
                ) : null}
            </>
        );
    const hours = rows ? (
        <dl data-visit-hours="" className={measure.hours}>
            {rows.map((row) => {
                const on = row.day === today;
                const tone = on ? measure.today : measure.other;
                return (
                    <div
                        key={row.day}
                        className={
                            live
                                ? "flex justify-between gap-4 py-1.5"
                                : "contents"
                        }
                    >
                        <dt className={tone}>
                            {SHORT_DAY[row.day]}
                            {on ? " · today" : ""}
                        </dt>
                        <dd className={tone}>{row.hours ?? "Closed"}</dd>
                    </div>
                );
            })}
        </dl>
    ) : null;
    const actions =
        directions || phone ? (
            <div className="flex flex-wrap gap-3">
                {directions ? (
                    <a
                        href={directions}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={frontButton(look, "outline")}
                    >
                        <LookIcon name="pin" look={look} size={18} />
                        Get directions
                    </a>
                ) : null}
                {phone ? (
                    <a
                        href={ctaHref({ kind: "call", number: phone }, noPage)}
                        className={frontButton(
                            look,
                            live ? "outline" : "quiet",
                        )}
                    >
                        <LookIcon name="call" look={look} size={18} />
                        Call {phoneText(phone)}
                    </a>
                ) : null}
            </div>
        ) : null;
    return (
        <section
            data-site-look-visit={look}
            className="text-site-fg w-full py-[var(--site-section-padding)]"
        >
            <div className={FRONT_WRAP}>
                {live ? (
                    <div className={measure.grid}>
                        <div
                            className={cn(
                                card,
                                "grid min-w-0 content-start gap-4 p-6",
                            )}
                        >
                            {head}
                            {open}
                            {actions}
                        </div>
                        {hours ? (
                            <div
                                className={cn(
                                    card,
                                    "grid content-start gap-1 px-6 py-4",
                                )}
                            >
                                <p className="text-site-fg m-0 font-bold">
                                    Hours
                                </p>
                                {hours}
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <div className={measure.grid}>
                        <div className="grid min-w-0 content-start gap-4">
                            {head}
                            {open}
                        </div>
                        <div className="grid min-w-0 content-start gap-7">
                            {hours}
                            {actions}
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}

/**
 * "Open now · closes 9 pm" under a look, as a live fact (U8's
 * `LiveFact`): a box of a fixed height from the first paint, worked out in
 * the browser from the place's hours on the business's clock and again
 * each minute, so it is never left saying Open after closing. When it
 * can't be said (no hours for today), the line says today's hours
 * instead, never a guess (VD07). Visit us is read in the browser, so the
 * cached page never carries it.
 */
function OpenLine({
    week,
    timeZone,
    now: fixed,
    closedDates,
    todayHours,
}: {
    week: PublicVisit["hours"];
    timeZone: string;
    now?: Date;
    closedDates: readonly string[];
    todayHours: string | null;
}) {
    const [tick, setTick] = useState(() => Date.now());
    useEffect(() => {
        if (fixed) return;
        const timer = setInterval(() => setTick(Date.now()), 60_000);
        return () => clearInterval(timer);
    }, [fixed]);
    const at = fixed ?? new Date(tick);
    const read: LiveRead<Date> = {
        status: "fresh",
        data: at,
        fetchedAt: at.getTime(),
    };
    return (
        <LiveFact
            read={read}
            reserve="min-h-[26px]"
            className="text-site-fg flex items-center gap-2 text-[15px] font-semibold"
            pick={(moment) => {
                const state = week
                    ? openState(week, moment, timeZone, closedDates)
                    : null;
                return state
                    ? { text: openStateText(state), open: state.open }
                    : null;
            }}
            fresh={(value) => (
                <span
                    data-visit-open=""
                    className="inline-flex items-center gap-2"
                >
                    <span
                        aria-hidden="true"
                        className={cn(
                            "inline-block size-2 rounded-full",
                            value.open ? "bg-site-accent" : "bg-site-muted",
                        )}
                    />
                    {value.text}
                </span>
            )}
            fallback={
                todayHours ? <span data-visit-open="">{todayHours}</span> : null
            }
        />
    );
}

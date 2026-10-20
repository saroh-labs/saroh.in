"use client";

import type { LookId } from "@saroh/block-contract";
import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback } from "react";

import { DEFAULT_API_URL } from "../api-url";
import { FRONT_RING, frontButton } from "../blocks/look-front";
import type { PublicToday, PublicTodayItem } from "../blocks/on-today";
import { isPublicToday, isTodayItem, todayHref } from "../blocks/on-today";
import { clockWords } from "../lib/clock";
import { openState, openStateText } from "../lib/opening-hours";
import { cn } from "../lib/utils";
import { useQrSource, withQrSource } from "../qr-source";
import { LiveFact } from "./live-fact";
import { checkedWords, nextFreeWhen, placesLeftWords } from "./live-words";
import type { LiveRead } from "./use-live-read";
import { useLiveRead } from "./use-live-read";

/**
 * "Next free" under a look (DEC-172, plan U8, #1042), read in the
 * browser from the site's `today` read, which names the soonest time any
 * service on the booking page can still be booked at (`nextFree`). Per
 * service, never per person (Phase 2, #1041).
 *
 * Three places draw it, all from the one read (`useLiveRead` shares it):
 *
 * - the hero's slot under Folio and Quiet (VA01, VD01): "Next free ·
 *   Hatha yoga · Wed 21 Oct, 7:00 am · 3 places left", and a link to book
 *   that time;
 * - Live's Now strip (VB00Live, VB01): "6:00 pm Vinyasa flow · 3 left",
 *   with "Open now · closes 9pm" and "Checked 5:20 pm" under it;
 * - the phone's Book bar (VD01): "Next free: today, 6:00 pm".
 *
 * Until the read answers, and whenever it fails or finds nothing free, the
 * slot keeps the plain "See times" the cached page was sent with, at the
 * same height. A count shows only while the answer is under a minute old
 * and the count is 5 or fewer; an older answer keeps the time and hides
 * the count while it checks again (VB00Live's four states).
 */

/** What the live today read returns, with `nextFree` (U8). */
export type LiveToday = PublicToday & { nextFree: PublicTodayItem | null };

/**
 * The today read, narrowed. An API from before U8 sends no `nextFree`:
 * that reads as nothing free (the slot keeps "See times").
 */
export function parseLiveToday(body: unknown): LiveToday | undefined {
    if (!isPublicToday(body)) return undefined;
    const next = (body as { nextFree?: unknown }).nextFree;
    if (next === undefined || next === null) return { ...body, nextFree: null };
    return isTodayItem(next) ? { ...body, nextFree: next } : undefined;
}

/** The site's today read's address, or null where no site is live. */
export function todayUrl(
    siteId: string | null | undefined,
    apiUrl: string | null | undefined,
): string | null {
    if (!siteId) return null;
    const base = apiUrl ?? DEFAULT_API_URL;
    return `${base}/public/sites/${encodeURIComponent(siteId)}/today`;
}

/** The site's today read, shared by every fact on the page. */
export function useTodayRead(
    siteId: string | null | undefined,
    apiUrl: string | null | undefined,
): LiveRead<LiveToday> {
    return useLiveRead(todayUrl(siteId, apiUrl), parseLiveToday);
}

const pickNext = (today: LiveToday) =>
    today.nextFree ? { item: today.nextFree, today } : null;

type Next = NonNullable<ReturnType<typeof pickNext>>;

/** "Book this class" for a class, "Book this time" for a one-to-one. */
function bookWords(item: PublicTodayItem): string {
    return item.kind === "class" ? "Book this class" : "Book this time";
}

/**
 * The hero's next booking (U6's `data-site-next-free` slot), per look.
 * `fallback` is the slot's own "See times", drawn by the server.
 */
export function HeroNextFree({
    look,
    siteId,
    apiUrl,
    bookHref,
    fallback,
    read: given,
}: {
    look: LookId;
    siteId?: string | null;
    apiUrl?: string;
    bookHref: string;
    fallback: ReactNode;
    /** A read to draw instead (tests). */
    read?: LiveRead<LiveToday>;
}) {
    const own = useTodayRead(given ? null : siteId, apiUrl);
    const read = given ?? own;
    const source = useQrSource();
    const href = useCallback(
        (item: PublicTodayItem) =>
            withQrSource(todayHref(bookHref, item), source),
        [bookHref, source],
    );

    if (look === "live") {
        return (
            <LiveFact
                read={read}
                pick={pickNext}
                reserve="min-h-[76px]"
                className="flex w-full flex-col justify-start gap-1"
                label="Next free"
                loading={fallback}
                fallback={fallback}
                fresh={(next, at) => (
                    <NowStrip
                        next={next}
                        href={href(next.item)}
                        checkedAt={at}
                        count
                    />
                )}
                stale={(next) => (
                    <NowStrip
                        next={next}
                        href={href(next.item)}
                        count={false}
                    />
                )}
            />
        );
    }

    return (
        <LiveFact
            read={read}
            pick={pickNext}
            reserve="min-h-[64px]"
            className={cn(
                "flex w-full min-w-0 flex-col justify-center gap-0.5",
                look === "quiet" && "min-[700px]:items-center",
            )}
            label="Next free"
            loading={fallback}
            fallback={fallback}
            fresh={(next) => (
                <SlotLine
                    look={look}
                    next={next}
                    href={href(next.item)}
                    count
                />
            )}
            stale={(next) => (
                <SlotLine
                    look={look}
                    next={next}
                    href={href(next.item)}
                    count={false}
                />
            )}
        />
    );
}

/** Folio's and Quiet's line: Next free, what, when, a small true count. */
function SlotLine({
    look,
    next,
    href,
    count,
}: {
    look: LookId;
    next: Next;
    href: string;
    count: boolean;
}) {
    const { item, today } = next;
    const places = count ? placesLeftWords(item.placesLeft) : null;
    return (
        <>
            <p
                data-live-value=""
                className="text-site-body w-full truncate text-[14.5px] tabular-nums leading-5 min-[700px]:w-auto"
            >
                <span className="text-site-muted mr-3 text-[12px] font-semibold uppercase tracking-[0.18em]">
                    Next free
                </span>
                <span className="text-site-fg font-semibold">
                    {item.serviceName}
                </span>
                {" · "}
                {nextFreeWhen(item, today.date)}
                {places ? (
                    <>
                        {" · "}
                        <PlacesLeft words={places} />
                    </>
                ) : null}
            </p>
            <Link
                href={href}
                className={frontButton(look, "link", "text-site-accent-text")}
            >
                {bookWords(item)}
            </Link>
        </>
    );
}

/** "Last place" in the accent's text colour (4.5:1, KD4); the rest plain. */
function PlacesLeft({ words }: { words: string }) {
    return (
        <span
            data-live-count=""
            className={
                words === "Last place"
                    ? "text-site-accent-text font-semibold"
                    : undefined
            }
        >
            {words}
        </span>
    );
}

/**
 * Live's Now strip (VB00Live "Now strip · fresh", VB01): the next free
 * time and what it is, its count while fresh, and under it whether the
 * place is open and when this was checked. Dark, as drawn; no pulse.
 */
function NowStrip({
    next,
    href,
    count,
    checkedAt,
}: {
    next: Next;
    href: string;
    count: boolean;
    checkedAt?: number;
}) {
    const { item, today } = next;
    const places = count
        ? placesLeftWords(item.placesLeft, { short: true })
        : null;
    const open = openState(
        today.hours,
        new Date(),
        today.timezone,
        today.closedDates,
    );
    const when =
        item.date === today.date
            ? clockWords(item.time)
            : nextFreeWhen(item, today.date);
    const under = [
        open ? openStateText(open) : null,
        checkedAt ? checkedWords(checkedAt, today.timezone) : null,
    ].filter((part): part is string => part !== null);
    return (
        <>
            <Link
                href={href}
                aria-label={`Next free: ${item.serviceName}, ${nextFreeWhen(item, today.date)}${places ? `, ${places}` : ""}`}
                className={cn(
                    "bg-site-fg text-site-bg flex min-h-[54px] w-full min-w-0 items-center gap-3 rounded-full px-4 text-[14.5px] font-semibold",
                    FRONT_RING,
                )}
            >
                <span
                    data-live-value=""
                    className="min-w-0 flex-1 truncate tabular-nums"
                >
                    {when} {item.serviceName}
                </span>
                {places ? (
                    <span
                        data-live-count=""
                        className="bg-site-bg text-site-fg shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12.5px] font-bold tabular-nums"
                    >
                        {places}
                    </span>
                ) : null}
            </Link>
            <p className="text-site-muted h-[18px] truncate px-1 text-[12.5px] leading-[18px]">
                {under.join(" · ")}
            </p>
        </>
    );
}

/**
 * The Book bar's line (VD01's bar): "Next free: today, 6:00 pm", or
 * nothing at the same height. The bar's own button is the way in, so a
 * failed read shows nothing here, never "See times" twice.
 */
export function BarNextFree({
    siteId,
    apiUrl,
    read: given,
}: {
    siteId?: string | null;
    apiUrl?: string;
    read?: LiveRead<LiveToday>;
}) {
    const own = useTodayRead(given ? null : siteId, apiUrl);
    const read = given ?? own;
    return (
        <LiveFact
            read={read}
            pick={pickNext}
            reserve="min-h-[18px]"
            className="min-w-0 flex-1"
            fresh={(next) => <BarLine next={next} />}
            stale={(next) => <BarLine next={next} />}
        />
    );
}

function BarLine({ next }: { next: Next }) {
    return (
        <p
            data-live-value=""
            className="text-site-body truncate text-[13px] tabular-nums leading-[18px]"
        >
            Next free: {nextFreeWhen(next.item, next.today.date)}
        </p>
    );
}

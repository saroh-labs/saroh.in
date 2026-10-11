"use client";

import { formatClock } from "@/lib/format/datetime";
import { useEffect, useRef, useSyncExternalStore } from "react";

import type { Span } from "@/lib/services/diary";
import { localMinuteOf } from "@/lib/services/diary";

import { at, tall } from "./geometry";

// The clock is an external thing, so it is read as a store: the server and
// the first client render both get "not known" (null), and the real minute
// arrives after hydration. The server's clock and the browser's never have
// to agree, so the now line cannot cause a hydration mismatch.
const TICK_MS = 15_000;
const subscribe = (tick: () => void) => {
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
};
const idle = () => () => undefined;
// A whole minute, so the snapshot is the same value until the minute turns.
const minuteStamp = () => Math.floor(Date.now() / 60_000);
const unknown = () => null;

/**
 * The minute it is now in the business's time zone, from local midnight.
 * Null on the server, while hydrating, and when `on` is false (the diary is
 * not showing today).
 */
export function useNowMinute(timezone: string, on: boolean): number | null {
    const stamp = useSyncExternalStore<number | null>(
        on ? subscribe : idle,
        minuteStamp,
        unknown,
    );
    return on && stamp !== null
        ? localMinuteOf(new Date(stamp * 60_000), timezone)
        : null;
}

const inside = (minute: number | null, [from, to]: Span): minute is number =>
    minute !== null && minute >= from && minute <= to;

/** The thin line across a column at now. Decoration: the rail says the time. */
export function NowLine({
    minute,
    span,
}: {
    minute: number | null;
    span: Span;
}) {
    if (!inside(minute, span)) return null;
    return (
        <div
            aria-hidden
            data-now-line=""
            className="pointer-events-none absolute inset-x-0 z-[3] h-px bg-destructive"
            style={{ top: at(minute, span[0]) }}
        />
    );
}

/** The time now, on the hour rail, level with the now line. */
export function NowTime({
    minute,
    span,
}: {
    minute: number | null;
    span: Span;
}) {
    if (!inside(minute, span)) return null;
    // "10:42 am" in full for a screen reader; the rail is 52px wide, so
    // what is drawn leaves the am or pm to the hour marks around it.
    const full = formatClock(minute);
    return (
        <div
            data-now-time=""
            className="absolute inset-x-0 z-[3] h-px"
            style={{ top: at(minute, span[0]) }}
        >
            <span className="absolute -top-2 right-1 whitespace-nowrap rounded-[4px] bg-destructive px-1 text-[11px] font-semibold tabular-nums leading-4 text-destructive-foreground">
                <span className="sr-only">Now, {full}</span>
                <span aria-hidden>{full.split(" ")[0]}</span>
            </span>
        </div>
    );
}

/**
 * Brings a time of the diary into view once per `sightKey` (a day and a
 * layout): now on today, else the first booking or the opening time. It
 * scrolls only as far as it must, and never smoothly for someone who asked
 * for reduced motion. Put the returned anchor inside the hour rail.
 */
export function FirstSight({
    sightKey,
    minute,
    span,
}: {
    sightKey: string;
    minute: number | null;
    span: Span;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const seen = useRef<string | null>(null);
    useEffect(() => {
        const el = ref.current;
        if (minute === null || !el || seen.current === sightKey) return;
        seen.current = sightKey;
        // Not every browser (or a test's) has it; the diary is whole without.
        if (typeof el.scrollIntoView !== "function") return;
        const still =
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({
            block: "nearest",
            inline: "nearest",
            behavior: still ? "auto" : "smooth",
        });
    }, [sightKey, minute]);
    if (minute === null) return null;
    // An hour before the time to two hours after it, inside the hours shown.
    const top = Math.max(span[0], minute - 60);
    const bottom = Math.min(span[1], minute + 120);
    return (
        <div
            ref={ref}
            aria-hidden
            className="pointer-events-none absolute left-0 w-px"
            style={{ top: at(top, span[0]), height: tall(top, bottom) }}
        />
    );
}

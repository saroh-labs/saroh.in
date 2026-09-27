import { useSyncExternalStore } from "react";

import type { BookingDays, BookingService, BookingStart } from "./model";
import { dateIn, dateText, timeIn } from "./model";

// ── The phone breakpoint, read without a render-time window ─────────────

const PHONE_QUERY = "(max-width: 699px)";

function subscribePhone(onChange: () => void): () => void {
    const mq = window.matchMedia(PHONE_QUERY);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
}

export function usePhone(): boolean {
    return useSyncExternalStore(
        subscribePhone,
        () => window.matchMedia(PHONE_QUERY).matches,
        () => false,
    );
}

export function newKey(): string {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
}

/** "India Standard Time", or the zone's own name when Intl has no word. */
export function zoneName(zone: string): string {
    try {
        const part = new Intl.DateTimeFormat("en-GB", {
            timeZone: zone,
            timeZoneName: "long",
        })
            .formatToParts(new Date())
            .find((p) => p.type === "timeZoneName");
        return part?.value ?? zone;
    } catch {
        return zone;
    }
}

export function kicker(services: BookingService[]): string {
    const classes = services.some((s) => s.kind === "class");
    const ones = services.some((s) => s.kind === "one");
    if (classes && ones) return "Classes and appointments";
    return classes ? "Classes" : "Appointments";
}

/**
 * The first start after `after` that is still free (a class needs a place
 * left): what the page chooses when the time went while they signed in (A9).
 */
export function nextFreeStart(
    days: BookingDays,
    after: string,
    isClass: boolean,
): BookingStart | null {
    return (
        days.days
            .flatMap((d) => d.starts)
            .find(
                (s) =>
                    s.startAt > after && (!isClass || (s.placesLeft ?? 0) > 0),
            ) ?? null
    );
}

/** "That time has just gone. We've chosen the next free one: Sun 20 Sep at 08:00." */
export function nextChosenText(start: BookingStart, zone: string): string {
    const day = dateText(dateIn(start.startAt, zone), true);
    return `That time has just gone. We've chosen the next free one: ${day} at ${timeIn(start.startAt, zone)}.`;
}

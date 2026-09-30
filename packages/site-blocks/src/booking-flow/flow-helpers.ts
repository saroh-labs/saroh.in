import { useSyncExternalStore } from "react";

import type { PublicVisit } from "../blocks/visit-us";
import { weekSummary } from "../lib/opening-hours";
import type {
    BookingDays,
    BookingService,
    BookingStart,
    BookPay,
} from "./model";
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

// ── The header's facts (E6) ─────────────────────────────────────────────

/** The page's title: a session where classes are offered, else an appointment. */
export function pageTitle(services: BookingService[]): string {
    return services.some((s) => s.kind === "class")
        ? "Book your next session"
        : "Book your appointment";
}

/** What the header says about the business, from G8's public visit read. */
export interface HeaderFacts {
    /** "12th Main, Indiranagar · Open Mon–Sat 9am–7pm", or null for neither. */
    place: string | null;
    /** The public phone, E.164 (for `tel:`), or null when none is set. */
    phone: string | null;
}

/**
 * The business's address, hours and phone as the header shows them (E6).
 * They come from the one public visit read Visit us uses (G8), so the two
 * never disagree. Anything missing is left out rather than guessed: no
 * hours saved is no hours line, never "Closed".
 */
export function headerFacts(
    visit: PublicVisit | null | undefined,
): HeaderFacts {
    if (!visit) return { place: null, phone: null };
    const address = (visit.address ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join(", ");
    const week = weekSummary(visit.hours);
    const parts = [
        address,
        week ? `Open ${week.split(" · ").join(", ")}` : "",
    ].filter(Boolean);
    const phone = visit.phone?.trim();
    return {
        place: parts.length > 0 ? parts.join(" · ") : null,
        phone: phone === undefined || phone === "" ? null : phone,
    };
}

// ── A test release (DEC-071, T6) ─────────────────────────────────────────

/**
 * What the live site does at the booking page's last step, for a test
 * release's stop: "the customer signs in here and books Haircut, Sat 4 Oct
 * at 11:00 with Asha and pays ₹500".
 */
export function testReleaseBookingLine({
    serviceName,
    whenText,
    waitlist,
    pay,
    payingNow,
}: {
    serviceName: string;
    whenText: string;
    /** A full class: they would join its waitlist. */
    waitlist: boolean;
    pay: BookPay;
    /** What leaves their account at booking, for NOW and DEPOSIT. */
    payingNow: string;
}): string {
    const what = [serviceName, whenText].filter(Boolean).join(", ");
    if (waitlist) {
        return `the customer signs in here and joins the waitlist for ${what}`;
    }
    const paid =
        (pay === "NOW" || pay === "DEPOSIT") && payingNow
            ? ` and pays ${payingNow}`
            : pay === "CREDIT"
              ? " with 1 credit"
              : "";
    return `the customer signs in here and books ${what}${paid}`;
}

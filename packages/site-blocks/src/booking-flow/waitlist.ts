import type { Result } from "./api";
import { timeIn } from "./model";

/**
 * A full class's waitlist on the booking page (round-2 A12, R13): the
 * customer's own places in line, joining and leaving through the site's
 * server with their session, and every word the page says about it.
 *
 * A freed place is held for the first in line for up to 2 hours (or until
 * an hour before the class), then offered to the next; the person offered
 * it books it here, the normal way. Nothing is charged to wait. The page
 * never promises a message the business can't send: the API says how the
 * customer will hear (`reach`), and the words follow it.
 */

/** A place in line, as its holder reads it. */
export interface WaitlistPlace {
    startAt: string;
    /** WAITING in line, or OFFERED: a freed place is held for them. */
    status: "WAITING" | "OFFERED";
    /** 1 is next. Null once a place is held for them. */
    placeInLine: number | null;
    /** While OFFERED: until when the place is held. */
    offeredUntil: string | null;
}

/**
 * How they will hear a place is theirs (A14's reach): email, their account
 * on the site, both, or not at all — then they come back to this page.
 */
export type WaitlistReach =
    "EMAIL_AND_ACCOUNT" | "EMAIL" | "ACCOUNT" | "ON_SIGN_IN" | "NONE";

export interface WaitlistJoined extends WaitlistPlace {
    reach: WaitlistReach;
}

export interface WaitlistPlaces {
    places: WaitlistPlace[];
}

/** One session of a class, as the waitlist calls name it. */
export interface WaitlistSession {
    serviceId: string;
    startAt: string;
}

/**
 * The site's server actions for the waitlist, with the session
 * (`public/site-accounts/waitlist`). Absent: full classes stay closed, as
 * before.
 */
export interface WaitlistApi {
    /** Their places in line for one service's classes. */
    mine: (request: { serviceId: string }) => Promise<Result<WaitlistPlaces>>;
    join: (request: WaitlistSession) => Promise<Result<WaitlistJoined>>;
    leave: (request: WaitlistSession) => Promise<Result<{ left: boolean }>>;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null;

export function isWaitlistPlace(v: unknown): v is WaitlistPlace {
    return (
        isObj(v) &&
        typeof v.startAt === "string" &&
        (v.status === "WAITING" || v.status === "OFFERED") &&
        (v.placeInLine === null || typeof v.placeInLine === "number") &&
        (v.offeredUntil === null || typeof v.offeredUntil === "string")
    );
}

export function isWaitlistPlaces(v: unknown): v is WaitlistPlaces {
    return (
        isObj(v) && Array.isArray(v.places) && v.places.every(isWaitlistPlace)
    );
}

const REACHES: readonly string[] = [
    "EMAIL_AND_ACCOUNT",
    "EMAIL",
    "ACCOUNT",
    "ON_SIGN_IN",
    "NONE",
];

export function isWaitlistJoined(v: unknown): v is WaitlistJoined {
    if (!isWaitlistPlace(v)) return false;
    const reach: unknown = (v as { reach?: unknown }).reach;
    return typeof reach === "string" && REACHES.includes(reach);
}

export function isWaitlistLeft(v: unknown): v is { left: boolean } {
    return isObj(v) && typeof v.left === "boolean";
}

// ── Words ────────────────────────────────────────────────────────────────

/** "1st", "2nd", "3rd", "11th". */
export function ordinal(n: number): string {
    const tens = n % 100;
    if (tens >= 11 && tens <= 13) return `${n}th`;
    switch (n % 10) {
        case 1:
            return `${n}st`;
        case 2:
            return `${n}nd`;
        case 3:
            return `${n}rd`;
        default:
            return `${n}th`;
    }
}

/**
 * What a full session says on its right (the Pulse Fitness design's "Full
 * — join waitlist"): held for them, their place in line, or join.
 */
export function fullSessionText(
    place: WaitlistPlace | undefined,
    zone: string,
): string {
    if (place?.status === "OFFERED") {
        return place.offeredUntil
            ? `Held for you until ${timeIn(place.offeredUntil, zone)}`
            : "Held for you";
    }
    if (place?.placeInLine) {
        return `On the waitlist · ${ordinal(place.placeInLine)}`;
    }
    return "Full — join waitlist";
}

/** How a place is held, said once where the waitlist is explained. */
const HOLD_RULE =
    "A freed place is held for up to 2 hours, then offered to the next person.";

/**
 * How they will hear, in words that are true for this business: an email
 * to their address, their account on the site, or — with neither — this
 * page, where a held place shows as theirs.
 */
export function waitlistReachText(reach: WaitlistReach, email: string): string {
    switch (reach) {
        case "EMAIL_AND_ACCOUNT":
        case "EMAIL":
            return `If a place frees up, we'll hold it for you and email ${email}.`;
        case "ACCOUNT":
            return "If a place frees up, we'll hold it for you and tell you in your account on this site.";
        default:
            return "If a place frees up, we'll hold it for you. Come back to this page to book it.";
    }
}

/** The done card's small print. */
export function waitlistTerms(): string {
    return `${HOLD_RULE} Nothing is charged until you book it.`;
}

/** Said when they leave. */
export const LEFT_WAITLIST = "You've left the waitlist for that class.";

/** Signed in, a place turned out to be held for them already. */
export function heldForYouText(offeredUntil: string | null, zone: string) {
    return offeredUntil
        ? `A place is held for you until ${timeIn(offeredUntil, zone)}. Book it before then.`
        : "A place is held for you. Book it now.";
}

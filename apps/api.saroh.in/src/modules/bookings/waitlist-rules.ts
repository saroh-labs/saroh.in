/**
 * The class waitlist's rules (round-2 A12, R13; defaults 9 and 76), pure so
 * each is tested on its own.
 *
 * - A freed place is held for the first in line for 2 hours, or until 1
 *   hour before the class, whichever is sooner.
 * - No place is offered inside the hour before a class starts.
 * - One account holds at most 10 places in line at once, waiting or
 *   offered.
 */

/** How long a freed place is held for the person offered it. */
export const OFFER_HOLD_MS = 2 * 60 * 60 * 1000;

/** No offer is made, or held, inside this long before the class. */
export const NO_OFFER_WITHIN_MS = 60 * 60 * 1000;

/** Places in line one account may hold at once (WAITING or OFFERED). */
export const MAX_LIVE_ENTRIES = 10;

/** Whether a freed place in a class starting at `startAt` may be offered now. */
export function mayOffer(startAt: Date, now: Date): boolean {
    return startAt.getTime() - NO_OFFER_WITHIN_MS > now.getTime();
}

/**
 * Until when an offer made now holds the place: 2 hours on, or 1 hour
 * before the class, whichever is sooner. Only called when {@link mayOffer}.
 */
export function offeredUntil(startAt: Date, now: Date): Date {
    return new Date(
        Math.min(
            now.getTime() + OFFER_HOLD_MS,
            startAt.getTime() - NO_OFFER_WITHIN_MS,
        ),
    );
}

/** The words a customer hears when they can't join, with their reason. */
export const WAITLIST_WORDS = {
    /** A place is free: book it instead (plan A12, 409). */
    room: "There's room — book it.",
    /** Past {@link MAX_LIVE_ENTRIES}. */
    tooMany: `You're on ${MAX_LIVE_ENTRIES} waitlists already. Leave one to join another.`,
    /** Inside the last hour, or already started. */
    tooLate: "This class starts too soon to wait for a place.",
    /** A one-to-one service, which has no waitlist. */
    notClass: "Only a class has a waitlist.",
    /** Not a session the class runs. */
    noSession: "That isn't a time this class runs.",
} as const;

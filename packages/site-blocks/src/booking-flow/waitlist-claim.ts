import { timeWords } from "../lib/clock";
import { dateIn, dateText, timeIn } from "./model";

/**
 * A waitlist offer's claim page (automatic notices U18, #1149): what the
 * API's `GET public/sites/:siteId/waitlist-claim/:token` answers, and what
 * the page says for it. Pure, so every word is tested; the page draws it
 * with `WaitlistClaimPage`.
 */

export type WaitlistClaimState = "open" | "booked" | "ended" | "gone";

export interface WaitlistClaim {
    state: WaitlistClaimState;
    business: string;
    serviceId: string;
    service: string;
    /** The session's start, ISO. */
    startAt: string;
    /** Until when the place is (or was) held, ISO. */
    heldUntil: string;
    timezone: string;
    /** Places free for anyone now. */
    placesLeft: number;
    /** A way back into the class: join its line again, or book a place. */
    rejoin: boolean;
}

const STATES: readonly WaitlistClaimState[] = [
    "open",
    "booked",
    "ended",
    "gone",
];

/** Narrows the API's answer field by field. */
export function isWaitlistClaim(value: unknown): value is WaitlistClaim {
    if (typeof value !== "object" || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
        STATES.includes(v.state as WaitlistClaimState) &&
        typeof v.business === "string" &&
        typeof v.serviceId === "string" &&
        typeof v.service === "string" &&
        typeof v.startAt === "string" &&
        !Number.isNaN(Date.parse(v.startAt)) &&
        typeof v.heldUntil === "string" &&
        !Number.isNaN(Date.parse(v.heldUntil)) &&
        typeof v.timezone === "string" &&
        typeof v.placesLeft === "number" &&
        typeof v.rejoin === "boolean"
    );
}

/**
 * The booking page on this session: the class chosen, its day and time
 * (`?service=&date=&start=`, as On today links, G18), in the class's zone.
 * Booking there takes the held place (`acceptWaitlistInTx`); a full one
 * offers its line.
 */
export function claimBookHref(claim: WaitlistClaim): string {
    const query = new URLSearchParams({
        service: claim.serviceId,
        date: dateIn(claim.startAt, claim.timezone),
        start: timeIn(claim.startAt, claim.timezone),
    });
    return `/book?${query.toString()}`;
}

/** "Tue 6 Oct at 11:00 am", in the class's zone. */
export function claimWhen(claim: WaitlistClaim): string {
    const zone = claim.timezone;
    return `${dateText(dateIn(claim.startAt, zone), true)} at ${timeWords(claim.startAt, zone)}`;
}

export interface ClaimWords {
    eyebrow: string;
    title: string;
    body: string;
    /** The one way on; null for none but the home page. */
    action: { label: string; href: string } | null;
}

/** What the page says, for each way the offer can stand. */
export function claimWords(claim: WaitlistClaim): ClaimWords {
    const when = claimWhen(claim);
    const until = timeWords(claim.heldUntil, claim.timezone);
    const book = claimBookHref(claim);
    const back = claim.rejoin
        ? {
              label:
                  claim.placesLeft > 0
                      ? "Book a place"
                      : "Join the waitlist again",
              href: book,
          }
        : null;
    switch (claim.state) {
        case "open":
            return {
                eyebrow: "A place opened up",
                title: claim.service,
                body: `${when}. A place in this class is held for you until ${until}.`,
                action: { label: `Book my spot until ${until}`, href: book },
            };
        case "booked":
            return {
                eyebrow: "Waitlist",
                title: "You've booked this place",
                body: `Your place in ${claim.service}, ${when}, is booked. This link has been used.`,
                action: null,
            };
        case "ended":
            return {
                eyebrow: "Waitlist",
                title: "This offer has ended",
                body: `The place in ${claim.service}, ${when}, was held for you until ${until}.`,
                action: back,
            };
        case "gone":
            return {
                eyebrow: "Waitlist",
                title: "This spot has gone",
                body: claim.rejoin
                    ? `The place in ${claim.service}, ${when}, was taken before it could be booked.`
                    : `${claim.service}, ${when}, can't be booked any more.`,
                action: back,
            };
    }
}

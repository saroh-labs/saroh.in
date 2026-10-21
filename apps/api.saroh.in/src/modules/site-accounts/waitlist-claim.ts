import { createHmac, timingSafeEqual } from "node:crypto";

import type { Prisma } from "@saroh/database";

import { contactSiteOrigin } from "./notice-link";

/**
 * The waitlist offer's claim link (automatic notices U18, #1149): the
 * offer's email says a freed place in a class is held for the customer
 * until a time, and this is the way to take it. The link opens
 * `/book/claim/‹token›` on the business's own site, which shows the class,
 * the time and when the hold ends, with "Book my spot" into the normal
 * booking path (the session chosen; booking accepts the place,
 * `acceptWaitlistInTx`).
 *
 * **The token** names one waitlist entry and the hold it was offered, and is
 * signed, so nobody can make one for an entry they weren't offered:
 *
 *     v1.<entry id>.<offeredUntil, ms>.<base64url(sig)>
 *
 * `sig` is HMAC-SHA256 over `waitlist-claim\nv1\n<entry id>\n<until>`, keyed
 * with the site sign-in code secret (`site-secrets.ts`); the purpose line
 * keeps it apart from every other HMAC under that key. Nothing is stored:
 *
 * - **Valid until `offeredUntil`.** The hold's end is in the token, and the
 *   entry's own must match it, so a link from an earlier hold never opens a
 *   later one.
 * - **Single use.** It opens an offer only while the entry is OFFERED;
 *   once booked (ACCEPTED) the same link says so and offers nothing.
 * - **Never a sign-in.** It shows the class, not the person, and booking
 *   still asks what the normal path asks (sign-in, as the place is the
 *   account's contact's).
 *
 * Kept apart from the notice registry so it moves with the WAITLIST_OFFER
 * notice wherever that lives (U2).
 */

const VERSION = "v1";
const PURPOSE = "waitlist-claim";
const MAX_TOKEN_LENGTH = 200;
/** A cuid entry id, and a hold's end in milliseconds. */
const TOKEN = /^v1\.([a-z0-9]{8,40})\.(\d{1,15})\.([A-Za-z0-9_-]{43})$/;

/** What a good token names. */
export interface ClaimToken {
    entryId: string;
    /** The hold's end the link was made for. */
    until: Date;
}

function signature(secret: string, entryId: string, until: number): Buffer {
    return createHmac("sha256", secret)
        .update(`${PURPOSE}\n${VERSION}\n${entryId}\n${until}`)
        .digest();
}

/** The token for one offer: the entry, and the hold's end. */
export function signClaimToken(
    secret: string,
    entryId: string,
    offeredUntil: Date,
): string {
    const until = offeredUntil.getTime();
    const sig = signature(secret, entryId, until).toString("base64url");
    return [VERSION, entryId, until, sig].join(".");
}

/**
 * What a token names, or null when it is malformed or forged. An expired
 * one still names its entry: the page says the offer has ended rather than
 * "not found". Never throws on input.
 */
export function verifyClaimToken(
    secret: string,
    token: unknown,
): ClaimToken | null {
    if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) {
        return null;
    }
    const m = TOKEN.exec(token);
    if (!m) return null;
    const entryId = m[1];
    const until = Number(m[2]);
    const given = Buffer.from(m[3], "base64url");
    const expected = signature(secret, entryId, until);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        return null;
    }
    return { entryId, until: new Date(until) };
}

/** The claim page's address on the business's site. */
export function waitlistClaimPath(token: string): string {
    return `/book/claim/${encodeURIComponent(token)}`;
}

/**
 * The offer email's claim link: the claim page on the contact's own site
 * (the one they last signed in on, else the business's first published
 * one). Null with no published site, or when anything goes wrong: the
 * notice goes without its link rather than not at all.
 */
export async function waitlistClaimUrl(
    db: Pick<Prisma.TransactionClient, "customerSession" | "site" | "domain">,
    organizationId: string,
    offer: { entryId: string; contactId: string; offeredUntil: Date },
    secret: () => string,
): Promise<string | null> {
    try {
        const origin = await contactSiteOrigin(
            db,
            organizationId,
            offer.contactId,
        );
        if (!origin) return null;
        const token = signClaimToken(
            secret(),
            offer.entryId,
            offer.offeredUntil,
        );
        return `${origin}${waitlistClaimPath(token)}`;
    } catch {
        return null;
    }
}

// ---- Where the offer stands ------------------------------------------------

/**
 * What the claim page says:
 * - `open`: the place is still held for them: "Book my spot until 6:30 pm".
 * - `booked`: they took it; the link is spent.
 * - `ended`: the hold ran out, or they left the line: "This offer has ended".
 * - `gone`: the place isn't there any more: taken by someone else while
 *   held, or the class cancelled, started or no longer offered: "This spot
 *   has gone".
 */
export type ClaimState = "open" | "booked" | "ended" | "gone";

export interface ClaimFacts {
    status: string;
    /** The entry's hold's end now. */
    offeredUntil: Date | null;
    /** The hold's end the token was made for. */
    tokenUntil: Date;
    startAt: Date;
    /** The class is still offered: active, not deleted, Appointments on. */
    offered: boolean;
    /** Places free for this person now, their own hold counted as free. */
    freeForThem: number;
}

/** Pure, so each case is tested on its own. */
export function claimState(facts: ClaimFacts, now: Date): ClaimState {
    if (facts.status === "ACCEPTED") return "booked";
    if (
        facts.status === "CLOSED" ||
        !facts.offered ||
        facts.startAt.getTime() <= now.getTime()
    ) {
        return "gone";
    }
    const held =
        facts.status === "OFFERED" &&
        facts.offeredUntil !== null &&
        facts.offeredUntil.getTime() === facts.tokenUntil.getTime() &&
        facts.offeredUntil.getTime() > now.getTime();
    if (!held) return "ended";
    return facts.freeForThem > 0 ? "open" : "gone";
}

/**
 * Whether the page offers a way back into the class: joining its line
 * again, or booking a place that is free. Not for a class that can't be
 * booked any more, nor for the place they already booked.
 */
export function mayRejoin(state: ClaimState, facts: ClaimFacts): boolean {
    if (state === "booked" || state === "open") return false;
    return facts.status !== "CLOSED" && facts.offered;
}

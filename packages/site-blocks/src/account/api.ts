/**
 * What the sign-in sheet asks of the site, and what it gets back (ADR-011;
 * round-2 plan A, A3).
 *
 * The sheet never calls the API itself. The site's server does, because the
 * session lives in a host-only cookie a browser script cannot read, and every
 * sign-in call must carry the server's signed relay. So the app that renders
 * the sheet passes its server actions in as a {@link SignInApi}, and they
 * answer in these shapes: plain data, never the API's own text, which is
 * written for Saroh rather than for a business's customer.
 */

/** What the sheet needs before anything is typed. */
export interface SignInOptions {
    businessName: string;
    /** The business's public phone, for "Or call ‹Business› on ‹phone›". */
    phone: string | null;
    /** Whether the bot challenge is likely, and its widget's public key. */
    challenge: { required: boolean; siteKey: string | null };
}

/** The signed-in customer as the site may show them. */
export interface SignedInCustomer {
    email: string;
    /** Null until the customer gives a name. */
    name: string | null;
}

export type CodeRequestResult =
    | { ok: true; resendAfterSeconds: number }
    /** The visitor's own limit, or a shared wait: try again after this. */
    | { ok: false; reason: "limit" | "wait"; retryAfterSeconds: number }
    /** Show the challenge, then ask again with its token. */
    | { ok: false; reason: "challenge"; siteKey: string | null }
    /** The email couldn't be sent. No booking is taken. */
    | { ok: false; reason: "unavailable" }
    /** The business isn't taking sign-ins (suspended or closing). */
    | { ok: false; reason: "closed" }
    /** Not an email address. */
    | { ok: false; reason: "email" }
    /** A test release (DEC-071, KTD-9): signing in is off. */
    | { ok: false; reason: "test-release" }
    | { ok: false; reason: "error" };

export type VerifyResult =
    | { ok: true; customer: SignedInCustomer }
    | { ok: false; reason: "invalid" | "expired" }
    /** A merge retired this email: it signs in as another now. */
    | { ok: false; reason: "merged"; signsInAs: string }
    | { ok: false; reason: "blocked" }
    /** The business isn't taking sign-ins (suspended or closing). */
    | { ok: false; reason: "closed" }
    | { ok: false; reason: "limit"; retryAfterSeconds: number }
    /** A test release (DEC-071, KTD-9): signing in is off. */
    | { ok: false; reason: "test-release" }
    | { ok: false; reason: "error" };

/** The site's server actions, handed to the sheet. */
export interface SignInApi {
    requestCode(email: string, challenge?: string): Promise<CodeRequestResult>;
    verifyCode(email: string, code: string): Promise<VerifyResult>;
}

/** "Try again in 40 seconds" / "Try again in 12 minutes". */
export function retryText(seconds: number): string {
    const s = Math.max(1, Math.ceil(seconds));
    if (s < 60) return `Try again in ${s} ${s === 1 ? "second" : "seconds"}`;
    const minutes = Math.ceil(s / 60);
    return `Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

/** The sentence when a code can't be sent (R4; user, 2026-09-27). */
export const UNAVAILABLE_TEXT =
    "We couldn't send your code — try again in a few minutes";

/** "Or call ‹Business› on ‹phone›", or null when there's no phone. */
export function callLine(
    businessName: string,
    phone: string | null,
): string | null {
    const number = phone?.trim();
    return number ? `Or call ${businessName} on ${number}` : null;
}

/** A six-digit code, from whatever was typed or pasted. */
export function codeDigits(value: string): string {
    return value.replace(/\D/g, "").slice(0, 6);
}

/** Loose on purpose: the API is the judge; this only gates the button. */
export function looksLikeEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

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
    /**
     * Whether a WhatsApp code is offered beside email (DEC-196): only while
     * the business sends them and its balance covers one. Absent from an
     * older API.
     */
    whatsapp?: boolean;
    /**
     * The ways the site offers now, in the business's order (DEC-196): the
     * first is the sheet's default, the rest "Use … instead". Absent from
     * an older API, which `whatsapp` alone then describes.
     */
    ways?: SignInWay[];
    /** A new customer may sign up with a phone alone, no email asked. */
    phoneOnlySignUp?: boolean;
}

/** A way a business's customers sign in (DEC-196). SMS waits for DLT. */
export type SignInWay = "EMAIL" | "WHATSAPP" | "SMS";

/**
 * What names a signed-in customer when they have no name: their email, or
 * the number of an account made by phone alone (DEC-196).
 */
export function customerHandle(
    customer: Pick<SignedInCustomer, "email" | "signInPhone">,
): string {
    return customer.email ?? customer.signInPhone ?? "";
}

/** How the sheet sends a code: to an email, or on WhatsApp to a phone. */
export type SheetWay = "email" | "phone";

/**
 * The ways the sheet offers, in the business's order: the first opens, the
 * rest are "Use … instead". WhatsApp only with the calls to make it; SMS
 * isn't drawn until it can be used; email when nothing else is left, as
 * the API does, so a customer is never left with no way in.
 */
export function sheetWays(
    options: Pick<SignInOptions, "ways" | "whatsapp">,
    canPhone: boolean,
): SheetWay[] {
    const listed =
        options.ways ??
        (options.whatsapp === true ? ["EMAIL", "WHATSAPP"] : ["EMAIL"]);
    const ways = listed.flatMap((way): SheetWay[] =>
        way === "EMAIL"
            ? ["email"]
            : way === "WHATSAPP" && canPhone
              ? ["phone"]
              : [],
    );
    return ways.length > 0 ? ways : ["email"];
}

/** The signed-in customer as the site may show them. */
export interface SignedInCustomer {
    /** Null for an account made by phone alone (DEC-196). */
    email: string | null;
    /** The verified phone they sign in with by WhatsApp, or null. */
    signInPhone?: string | null;
    /** Null until the customer gives a name. */
    name: string | null;
    /**
     * The phone the business has for them, or null. The booking page fills
     * its optional "Phone" with it. Absent from an older API.
     */
    phone?: string | null;
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
    /** Not an Indian mobile number (the WhatsApp way). */
    | { ok: false; reason: "phone" }
    /** The number isn't on WhatsApp. */
    | { ok: false; reason: "not-on-whatsapp" }
    /** A test release (DEC-071, KTD-9): signing in is off. */
    | { ok: false; reason: "test-release" }
    | { ok: false; reason: "error" };

export type VerifyResult =
    | { ok: true; customer: SignedInCustomer }
    | { ok: false; reason: "invalid" | "expired" }
    /**
     * A WhatsApp code proved a phone no account holds: the customer adds an
     * email, and its code (with this proof) adds the phone (DEC-196).
     */
    | { ok: false; reason: "email-needed"; phoneProof: string }
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
    verifyCode(
        email: string,
        code: string,
        phoneProof?: string,
    ): Promise<VerifyResult>;
    /** The WhatsApp way (DEC-196); a site without them offers email only. */
    requestPhoneCode?(
        phone: string,
        challenge?: string,
    ): Promise<CodeRequestResult>;
    verifyPhoneCode?(phone: string, code: string): Promise<VerifyResult>;
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
    "We couldn't send your code. Try again in a few minutes";

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

/** Loose on purpose: ten digits or more, as typed; the API is the judge. */
export function looksLikePhone(value: string): boolean {
    return value.replace(/\D/g, "").length >= 10;
}

/** Loose on purpose: the API is the judge; this only gates the button. */
export function looksLikeEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

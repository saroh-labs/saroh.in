import { randomInt } from "node:crypto";

/**
 * What the waitlist (U30, plan KTD-17) treats as "the same entry", and the
 * short ids in referral links. Pure, so the rules are tested on their own.
 */

/** The kinds of business the form offers, in its order. Never free text. */
export const WAITLIST_KINDS = [
    "salon",
    "gym",
    "clinic",
    "coach",
    "food",
    "shop",
    "creator",
    "other",
] as const;
export type WaitlistKind = (typeof WAITLIST_KINDS)[number];

/** The plans a "Get early access · ‹Plan›" button can name. */
export const WAITLIST_PLANS = ["free", "grow", "pro"] as const;
export type WaitlistPlan = (typeof WAITLIST_PLANS)[number];

const GMAIL = new Set(["gmail.com", "googlemail.com"]);

/**
 * An address as it is stored (trimmed, lower-cased: where the invite goes)
 * and as it is compared (`key`): `+tags` dropped everywhere; for Gmail, dots
 * dropped and googlemail folded into gmail. So `A.B+x@Gmail.com` and
 * `ab@gmail.com` are one person.
 *
 * The migration `20261021110000_waitlist_v2` backfills old rows with the
 * same rule in SQL; change one, change both.
 */
export function normaliseEmail(raw: string): { email: string; key: string } {
    const email = raw.trim().toLowerCase();
    const at = email.lastIndexOf("@");
    if (at <= 0) return { email, key: email };
    const domain = email.slice(at + 1);
    let local = email.slice(0, at).split("+")[0] ?? "";
    if (GMAIL.has(domain)) {
        local = local.replace(/\./g, "");
        return { email, key: `${local}@gmail.com` };
    }
    return { email, key: `${local}@${domain}` };
}

/**
 * A business name as it is compared: lower-cased, spaces collapsed. "" when
 * there is none (the V1 form asked for an email only).
 */
export function businessKey(name: string | null | undefined): string {
    return (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Lower-case letters and digits a reader cannot confuse (no 0/o, 1/l/i). */
const REF_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const REF_CODE_LENGTH = 8;
export const REF_CODE_PATTERN = /^[a-hj-km-np-z2-9]{8}$/;

/** A new referral id: 8 characters, about 8.5 × 10^11 of them. */
export function newRefCode(): string {
    let code = "";
    for (let i = 0; i < REF_CODE_LENGTH; i += 1) {
        code += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
    }
    return code;
}

/**
 * Where a signup came from, as stored: the page's `?src=`, lower-cased and
 * limited to letters, digits, dot, dash and underscore; "direct" when there
 * is nothing left.
 */
export function cleanSource(raw: string | null | undefined): string {
    const value = (raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "")
        .slice(0, 40);
    return value || "direct";
}

/**
 * Logs are not the place for a full address. Keeps enough to correlate a
 * support report without putting the list in the log aggregator.
 */
export function maskEmail(email: string): string {
    const [local = "", domain = ""] = email.split("@");
    const head = local.slice(0, 2);
    return `${head}${"*".repeat(Math.max(local.length - 2, 0))}@${domain}`;
}

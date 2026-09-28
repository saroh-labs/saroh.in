import { DISPLAY_LOCALE } from "@/lib/format/locale";

/**
 * Pure display helpers shared by the CRM pages (S3-005). No server imports, so
 * they are safe in both server and client components.
 */

/**
 * A contact's email as the page may show it: null for the reserved,
 * undeliverable placeholders the API gives a contact that holds no real
 * address (`…@account.invalid`, `…@removed.invalid`: a site account's
 * separate contact, a merge's tombstone, a privacy removal).
 */
export function contactEmail(email: string | null | undefined): string | null {
    if (!email) return null;
    const domain = email
        .slice(email.lastIndexOf("@") + 1)
        .trim()
        .toLowerCase();
    return domain === "account.invalid" || domain === "removed.invalid"
        ? null
        : email;
}

/** Whose details were removed for a privacy request (C11). */
export function isRemovedContact(c: {
    email: string;
    removedAt?: string | null;
}): boolean {
    return (
        !!c.removedAt ||
        /^removed\+[^@]*@removed\.invalid$/i.test(c.email.trim())
    );
}

/**
 * A contact's display name: full name if known, else the email, and
 * "Removed customer" once their details were removed (C11).
 */
export function contactName(c: {
    firstName: string | null;
    lastName: string | null;
    email: string;
    removedAt?: string | null;
}): string {
    if (isRemovedContact(c)) return "Removed customer";
    const full = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
    return full || (contactEmail(c.email) ?? "No name");
}

/**
 * Format an optional monetary value (minor units) as a plain amount.
 *
 * The locale is pinned rather than inherited: `undefined` resolves to the
 * runtime's locale, which differs between Node and the browser, so a
 * server-rendered amount could hydrate as a different string and fail the whole
 * tree. See `lib/format/locale.ts`.
 */
export function formatValue(value: number | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    return (value / 100).toLocaleString(DISPLAY_LOCALE, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

/**
 * A lead's status in words, and the pill it wears — "Open", not "OPEN"
 * (brand file §7). Won is the good outcome; lost is neutral rather than red,
 * because a lost lead is a fact to learn from, not an error.
 */
export const LEAD_STATUS = {
    OPEN: { label: "Open", variant: "draft" },
    WON: { label: "Won", variant: "success" },
    LOST: { label: "Lost", variant: "neutral" },
} as const;

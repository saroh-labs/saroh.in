import { DISPLAY_LOCALE } from "@/lib/format/locale";

/**
 * Pure display helpers shared by the CRM pages (S3-005). No server imports, so
 * they are safe in both server and client components.
 */

/** A contact's display name: full name if known, else the email. */
export function contactName(c: {
    firstName: string | null;
    lastName: string | null;
    email: string;
}): string {
    const full = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
    return full || c.email;
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

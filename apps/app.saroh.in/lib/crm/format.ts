import { count as countOf } from "@/lib/format/plural";
/**
 * Pure display helpers shared by the CRM pages (S3-005). No server imports, so
 * they are safe in both server and client components.
 */

/** The API's reserved placeholder domains (`contacts/contact-email.ts`). */
const PLACEHOLDER_DOMAINS = new Set([
    "account.invalid",
    "removed.invalid",
    "phone.invalid",
]);

/**
 * A contact's email as the page may show it: null for the reserved,
 * undeliverable placeholders the API gives a contact that holds no real
 * address (`…@account.invalid`, `…@removed.invalid`, `…@phone.invalid`: a
 * site account's separate contact, a merge's tombstone, a privacy removal,
 * a walk-in kept by their phone alone).
 */
export function contactEmail(email: string | null | undefined): string | null {
    if (!email) return null;
    const domain = email
        .slice(email.lastIndexOf("@") + 1)
        .trim()
        .toLowerCase();
    return PLACEHOLDER_DOMAINS.has(domain) ? null : email;
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
    /** The email their site account signs in with (UX-013). */
    accountEmail?: string | null;
}): string {
    if (isRemovedContact(c)) return "Removed customer";
    const full = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
    return full || (shownEmail(c) ?? "No name");
}

/**
 * The email a contact row shows: its own, else the one their site account
 * signs in with (a site account's separate contact holds only a reserved
 * placeholder, DEC-049), else null. Never a placeholder (UX-013).
 */
export function shownEmail(c: {
    email: string | null;
    accountEmail?: string | null;
}): string | null {
    return contactEmail(c.email) ?? contactEmail(c.accountEmail);
}

/**
 * Open leads in words (UX-051): "₹5,000 · 2 leads" when they carry a
 * value, "1 open lead" when none does — never "unvalued (1)".
 */
export function openLeadsLabel(
    count: number,
    value: string | null,
): string | null {
    if (count <= 0) return null;
    const leads = countOf(count, "lead");
    if (value) return `${value} · ${leads}`;
    return countOf(count, "open lead");
}

/**
 * A lead's status in words, and the pill it wears — "Open", not "OPEN"
 * (brand file §7). Won is the good outcome; lost is neutral rather than red,
 * because a lost lead is a fact to learn from, not an error.
 */
export const LEAD_STATUS = {
    OPEN: { label: "Open", variant: "active" },
    WON: { label: "Won", variant: "success" },
    LOST: { label: "Lost", variant: "neutral" },
} as const;

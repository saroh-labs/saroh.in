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

/** Format an optional monetary value (minor units) as a plain amount. */
export function formatValue(value: number | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    return (value / 100).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

import { normaliseEmail } from "../waitlist/waitlist-keys";

/**
 * Saroh's own sales leads (DEC-169, admin console U20): the closed lists the
 * migration `20261129100000_saroh_leads` CHECKs. Change one, change both.
 */

/** Where a lead first came from. */
export const LEAD_SOURCES = ["WEBSITE", "WAITLIST", "ADDED"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

/** The board's columns, in order. Won and Lost close a lead. */
export const LEAD_STAGES = [
    "NEW",
    "TALKED",
    "DEMO",
    "TRIAL",
    "WON",
    "LOST",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/** Stages a lead is still being worked in. */
export const OPEN_STAGES: readonly LeadStage[] = [
    "NEW",
    "TALKED",
    "DEMO",
    "TRIAL",
];

/** How the owner came to own it. */
export const LEAD_OWNED_HOW = ["ADDED", "ASSIGNED"] as const;
export type LeadOwnedHow = (typeof LEAD_OWNED_HOW)[number];

/** A contact log entry's kind. */
export const CONTACT_KINDS = ["CALL", "VISIT", "MESSAGE"] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

/** How long a website lead that never became a business is kept. */
export const WEBSITE_LEAD_KEEP_DAYS = 365;

/** An email as a lead stores it, and the key leads are merged by. */
export function leadEmail(raw: string): { email: string; key: string } {
    return normaliseEmail(raw);
}

/** Trimmed text with its spaces collapsed, or null when nothing is left. */
export function textOrNull(value: string | null | undefined): string | null {
    const text = value?.trim().replace(/\s+/g, " ");
    return text === undefined || text === "" ? null : text;
}

/** Trimmed, line breaks kept, or null when nothing is left. */
export function longTextOrNull(
    value: string | null | undefined,
): string | null {
    const text = value?.trim();
    return text === undefined || text === "" ? null : text;
}

/**
 * Is the follow-up overdue on `today` (`YYYY-MM-DD`, the day in India)?
 * Only an open lead's follow-up can be; a day before today is overdue.
 */
export function isOverdue(
    lead: { stage: string; followUpOn: Date | null },
    today: string,
): boolean {
    if (!lead.followUpOn) return false;
    if (!(OPEN_STAGES as readonly string[]).includes(lead.stage)) return false;
    return lead.followUpOn.toISOString().slice(0, 10) < today;
}

/** `YYYY-MM-DD` to the `@db.Date` value Prisma stores. */
export function calendarDay(day: string): Date {
    return new Date(`${day}T00:00:00.000Z`);
}

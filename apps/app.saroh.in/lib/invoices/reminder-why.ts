import type { ReminderRow } from "./remind-all";

/**
 * Why a reminder doesn't go by email, or doesn't go at all, in one set of
 * words for every screen that says it (review #30, 20 Oct 2026): Remind
 * many's three groups (`remind-many.ts`) and Home's Remind all
 * (`lib/home/remind-all.ts`). Each screen branches on the code, never on
 * the words, so rewording one never changes what a screen decides.
 */
export type ReminderWhyCode =
    /** WhatsApp instead: no email provider of the business's own. */
    | "EMAIL_NOT_CONNECTED"
    /** WhatsApp instead: they turned off email from the business. */
    | "EMAIL_OFF"
    /** WhatsApp instead: no email address on file. */
    | "NO_EMAIL"
    /** Waits: one reminder a day. */
    | "REMINDED_TODAY"
    /** Waits: heard from in the last few days (Home's `quietDays`). */
    | "REMINDED_RECENTLY"
    /** An autopay charge is under way on it. */
    | "AUTOPAY"
    /** No phone, and no email provider connected. */
    | "UNREACHABLE_NOT_CONNECTED"
    /** No phone, and they turned off email from the business. */
    | "UNREACHABLE_EMAIL_OFF"
    /** No email and no phone. */
    | "UNREACHABLE"
    | "PAID"
    | "DRAFT"
    | "ORDER"
    /** Cancelled, or otherwise no longer owed. */
    | "NOT_OWED";

export interface ReminderWhy {
    code: ReminderWhyCode;
    /** "No email provider connected", "Reminded yesterday". */
    words: string;
}

const WORDS: Record<ReminderWhyCode, string> = {
    EMAIL_NOT_CONNECTED: "No email provider connected",
    EMAIL_OFF: "Turned off email from you",
    NO_EMAIL: "No email address",
    REMINDED_TODAY: "Reminded today. Next one tomorrow (one a day).",
    REMINDED_RECENTLY: "Reminded in the last few days",
    AUTOPAY: "Autopay is taking it now",
    UNREACHABLE_NOT_CONNECTED: "No phone, and no email provider connected",
    UNREACHABLE_EMAIL_OFF: "Turned off email from you, and no phone",
    UNREACHABLE: "No email or phone to reach them",
    PAID: "Paid already",
    DRAFT: "Not issued yet",
    ORDER: "Belongs to an order: remind from the order",
    NOT_OWED: "Not owed any more",
};

/** The words for a code. */
export function whyWords(code: ReminderWhyCode): string {
    return WORDS[code];
}

/** The code for one row of the preview; null when it goes by email. */
export function reminderWhyCode(
    row: Pick<ReminderRow, "way" | "reason" | "emailBlocked">,
): ReminderWhyCode | null {
    switch (row.way) {
        case "EMAIL":
            return null;
        case "WHATSAPP":
            return row.reason === "NO_EMAIL_PROVIDER"
                ? "EMAIL_NOT_CONNECTED"
                : row.reason === "EMAIL_OFF"
                  ? "EMAIL_OFF"
                  : "NO_EMAIL";
        case "WAIT":
            return row.reason === "REMINDED_RECENTLY"
                ? "REMINDED_RECENTLY"
                : "REMINDED_TODAY";
        case "NONE":
            switch (row.reason) {
                case "AUTOPAY_PENDING":
                    return "AUTOPAY";
                case "UNREACHABLE":
                    return row.emailBlocked === "NO_EMAIL_PROVIDER"
                        ? "UNREACHABLE_NOT_CONNECTED"
                        : row.emailBlocked === "EMAIL_OFF"
                          ? "UNREACHABLE_EMAIL_OFF"
                          : "UNREACHABLE";
                case "PAID":
                    return "PAID";
                case "DRAFT":
                    return "DRAFT";
                case "ORDER":
                    return "ORDER";
                default:
                    return "NOT_OWED";
            }
    }
}

/**
 * Why one row of the preview doesn't go by email, with its words; null
 * when it does. A reminder that waits says when the last one went, where
 * the API worded it ("Reminded yesterday").
 */
export function reminderWhy(
    row: Pick<ReminderRow, "way" | "reason" | "emailBlocked" | "lastWords">,
): ReminderWhy | null {
    const code = reminderWhyCode(row);
    if (!code) return null;
    // Asked with quiet days (Home), the API says when: "Reminded today".
    const waits = code === "REMINDED_TODAY" || code === "REMINDED_RECENTLY";
    const words = waits && row.lastWords ? row.lastWords : WORDS[code];
    return { code, words };
}

/** A send refused because they turned off email: the same words. */
export function suppressedWhy(): ReminderWhy {
    return { code: "EMAIL_OFF", words: WORDS.EMAIL_OFF };
}

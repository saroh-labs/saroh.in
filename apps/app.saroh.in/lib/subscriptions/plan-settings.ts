import type { AutopayChargeTiming } from "./autopay-timing";

/**
 * The words of "Settings for every plan", under the Plans list (the
 * Subscriptions audit, 12 Oct 2026): each setting is a row that reads as
 * its label and what is saved, in a sentence, with Edit. Pure.
 */

export const PLAN_SETTINGS_TITLE = "Settings for every plan";

export const PAUSE_LABEL = "Members can pause from their account";

/** What the pause row reads: the label, then this. */
export function pauseSentence(on: boolean): string {
    return on
        ? "Yes, for 2, 4 or 8 weeks."
        : "No. You can still pause anyone from their subscription.";
}

/** The toast once the pause setting is saved. */
export function pauseSaved(on: boolean): string {
    return on
        ? "Members can pause from their account."
        : "Members can no longer pause from their account.";
}

export const TIMING_LABEL = "When autopay charges";

const TIMING_SENTENCE: Record<AutopayChargeTiming, string> = {
    ON_RENEWAL_DATE: "Autopay charges on the renewal date.",
    DAY_AFTER_RENEWAL: "Autopay charges the day after renewal.",
    ON_DUE_DATE: "Autopay charges on the due date.",
};

/** What the autopay row reads. */
export function timingSentence(timing: AutopayChargeTiming): string {
    return TIMING_SENTENCE[timing];
}

/** The toast once the timing is saved. */
export const TIMING_SAVED =
    "Timing saved. Renewals from now on charge this way. Charges already on their way keep their date.";

/** Under the group's title, for a role that can't change these. */
export const SETTINGS_READ_ONLY =
    "Only someone who can change subscriptions can change these.";

import { PROFILE } from "@/lib/edition";

import { plansShown } from "./plans-shown";

/**
 * Whether Settings › Plan and billing holds the Free note instead of plans
 * (Global launch plan KTD7, DEC-211): plans are hidden because this edition
 * has no Saroh billing, so the page says the business is on Free, that paid
 * plans aren't available yet, and offers "Tell me when". When Saroh bills the
 * edition (stage 9 adds its switch to `plansShown`), the plans come back and
 * the note goes. India with plans switched off keeps no page at all.
 */
export function freeNoteShown(): boolean {
    return !plansShown() && !PROFILE.sarohBilling;
}

/** The note's words. No price, no limit's number: the limits are said where they're met. */
export const FREE_NOTE = {
    title: "You're on Free",
    body: "Paid plans aren't available yet. Free has limits on how much you can use. Saroh tells you as you near one, and never deletes what you already have.",
    ask: "Tell me when",
    asked: "We'll tell you",
    askedLine: "We'll email you when paid plans are available.",
    failed: "That didn't go through. Try again.",
} as const;

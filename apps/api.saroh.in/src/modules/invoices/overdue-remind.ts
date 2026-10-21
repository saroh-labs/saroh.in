import { DateTime } from "luxon";

import { daysAgo } from "./overdue-bills";

/**
 * Overdue reminders, sent by Saroh when the business turns them on
 * (automatic notices U20, DEC-174 D3, opt-in). Pure: which reminder an
 * invoice is due, its claim key, and the hours it may go. The sweep is
 * `overdue-remind.handler.ts`.
 *
 * - **At most two automatic reminders**: the first 3 days after the due
 *   date, the second 10 days after, counted in whole days in the
 *   business's time zone. Reminders by hand don't count towards them.
 * - **Each has a week to go**: the first on days 3 to 9, the second on
 *   days 10 to 16. A reminder that couldn't go on its day (one went by
 *   hand or on WhatsApp in the last day, the one-a-day rule) goes the next
 *   time the sweep finds it free; one turned on late still sends the one
 *   whose week it is. From day 17 on, nothing.
 * - **Daytime only**: from 9 in the morning to 8 at night, the business's
 *   time, so nobody is asked to pay at 3 am.
 */

/** The `type` the sweep is registered under. */
export const OVERDUE_REMIND_TYPE = "invoice.overdue-remind";

/** How often the sweep runs. */
export const OVERDUE_REMIND_EVERY_MS = 60 * 60 * 1000;

/** The days after the due date each reminder goes, first and second. */
export const OVERDUE_REMINDER_DAYS = [3, 10] as const;

/** How many days each reminder may still go after its own day. */
export const OVERDUE_REMINDER_GRACE_DAYS = 6;

/** The business's hours the sweep sends in: from 9:00 to before 20:00. */
export const SEND_FROM_HOUR = 9;
export const SEND_UNTIL_HOUR = 20;

/** The `CustomerNotice.kind` each claim is written under. */
export const OVERDUE_NOTICE_KIND = "INVOICE_OVERDUE";

/** Which automatic reminder: the first or the second. */
export type OverdueStage = 1 | 2;

/**
 * Which automatic reminder an invoice due at `dueAt` is in its week for,
 * on `now`'s day in `zone`, or null when it is in neither.
 */
export function overdueStage(
    dueAt: Date,
    now: Date,
    zone: string,
): OverdueStage | null {
    if (dueAt >= now) return null;
    const late = daysAgo(dueAt, now, zone);
    const [first, second] = OVERDUE_REMINDER_DAYS;
    if (late >= first && late <= first + OVERDUE_REMINDER_GRACE_DAYS) return 1;
    if (late >= second && late <= second + OVERDUE_REMINDER_GRACE_DAYS) {
        return 2;
    }
    return null;
}

/** The claim that keeps each automatic reminder to one. */
export function overdueEventKey(
    invoiceId: string,
    stage: OverdueStage,
): string {
    return `invoice-overdue:${invoiceId}:${stage}`;
}

/** Whether `now` is inside the hours reminders go, in `zone`. */
export function inSendingHours(now: Date, zone: string): boolean {
    const hour = DateTime.fromJSDate(now, { zone }).hour;
    return hour >= SEND_FROM_HOUR && hour < SEND_UNTIL_HOUR;
}

/**
 * The due dates that can be in a reminder's week on `now`'s day in
 * `zone`: from the start of the day 16 days ago to the end of the day 3
 * days ago. A cheap bound for the read; {@link overdueStage} decides.
 */
export function dueWindow(now: Date, zone: string): { from: Date; to: Date } {
    const today = DateTime.fromJSDate(now, { zone }).startOf("day");
    const last = OVERDUE_REMINDER_DAYS[1] + OVERDUE_REMINDER_GRACE_DAYS;
    return {
        from: today.minus({ days: last }).toJSDate(),
        to: today.minus({ days: OVERDUE_REMINDER_DAYS[0] - 1 }).toJSDate(),
    };
}

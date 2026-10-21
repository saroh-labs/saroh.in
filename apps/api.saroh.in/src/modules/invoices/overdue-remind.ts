import { DateTime } from "luxon";

import type { OverdueTiming } from "../communications/overdue-timing";
import { DEFAULT_OVERDUE_TIMING } from "../communications/overdue-timing";
import { daysAgo } from "./overdue-bills";

/**
 * Overdue reminders, sent by Saroh when the business turns them on
 * (automatic notices U20, DEC-174 D3, opt-in). Pure: which reminder an
 * invoice is due, its claim key, and the hours it may go. The sweep is
 * `overdue-remind.handler.ts`.
 *
 * When is the business's choice (DEC-178, #1169), an {@link OverdueTiming}
 * (`communications/overdue-timing.ts`): by default 3 and 10 days after the
 * due date, from 9 am to 8 pm.
 *
 * - **At most two automatic reminders**: the first on its day after the
 *   due date, the second on its own, counted in whole days in the
 *   business's time zone. Reminders by hand don't count towards them.
 * - **Each has a window to go in**: from its day until the day before the
 *   next reminder's, and never more than a week (the first 3 to 9, the
 *   second 10 to 16, by default). A reminder that couldn't go on its day
 *   (one went by hand or on WhatsApp in the last day, the one-a-day rule)
 *   goes the next time the sweep finds it free; one turned on late still
 *   sends the one whose window it is. After the second's window, nothing.
 * - **Daytime only**: inside the business's chosen hours, its own time, so
 *   nobody is asked to pay at 3 am.
 */

/** The `type` the sweep is registered under. */
export const OVERDUE_REMIND_TYPE = "invoice.overdue-remind";

/** How often the sweep runs. */
export const OVERDUE_REMIND_EVERY_MS = 60 * 60 * 1000;

/** How many days each reminder may still go after its own day, at most. */
export const OVERDUE_REMINDER_GRACE_DAYS = 6;

/** The `CustomerNotice.kind` each claim is written under. */
export const OVERDUE_NOTICE_KIND = "INVOICE_OVERDUE";

/** Which automatic reminder: the first or the second. */
export type OverdueStage = 1 | 2;

/**
 * Each reminder's window, in whole days late: from its day to the last day
 * it may still go, both included. The first's ends the day before the
 * second's starts, so the two never overlap.
 */
export function reminderWindows(
    timing: OverdueTiming = DEFAULT_OVERDUE_TIMING,
): Record<OverdueStage, { from: number; to: number }> {
    const { firstDay, secondDay } = timing;
    return {
        1: {
            from: firstDay,
            to: Math.min(secondDay - 1, firstDay + OVERDUE_REMINDER_GRACE_DAYS),
        },
        2: {
            from: secondDay,
            to: secondDay + OVERDUE_REMINDER_GRACE_DAYS,
        },
    };
}

/**
 * Which automatic reminder an invoice due at `dueAt` is in its window for,
 * on `now`'s day in `zone`, or null when it is in neither.
 */
export function overdueStage(
    dueAt: Date,
    now: Date,
    zone: string,
    timing: OverdueTiming = DEFAULT_OVERDUE_TIMING,
): OverdueStage | null {
    if (dueAt >= now) return null;
    const late = daysAgo(dueAt, now, zone);
    const windows = reminderWindows(timing);
    for (const stage of [1, 2] as const) {
        const w = windows[stage];
        if (late >= w.from && late <= w.to) return stage;
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
export function inSendingHours(
    now: Date,
    zone: string,
    timing: OverdueTiming = DEFAULT_OVERDUE_TIMING,
): boolean {
    const hour = DateTime.fromJSDate(now, { zone }).hour;
    return hour >= timing.fromHour && hour < timing.untilHour;
}

/**
 * The due dates that can be in a reminder's window on `now`'s day in
 * `zone`: from the start of the day the second's window ends to the end of
 * the day the first's starts (16 and 3 days ago, by default). A cheap
 * bound for the read; {@link overdueStage} decides.
 */
export function dueWindow(
    now: Date,
    zone: string,
    timing: OverdueTiming = DEFAULT_OVERDUE_TIMING,
): { from: Date; to: Date } {
    const today = DateTime.fromJSDate(now, { zone }).startOf("day");
    const windows = reminderWindows(timing);
    return {
        from: today.minus({ days: windows[2].to }).toJSDate(),
        to: today.minus({ days: windows[1].from - 1 }).toJSDate(),
    };
}

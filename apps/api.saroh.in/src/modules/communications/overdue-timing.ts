import type { Prisma } from "@saroh/database";

/**
 * When a business's overdue reminders go (DEC-178, #1169): which days after
 * the due date the first and the second reminder go, and the hours of the
 * day they may go in, in the business's own time zone.
 *
 * Pure, as `notice-settings.ts` is: the defaults, the bounds, the words.
 * The business's choice is its `OverdueReminderTiming` row, kept only while
 * it differs from {@link DEFAULT_OVERDUE_TIMING}; the read and the write are
 * `notice-settings.service.ts`, and the sweep that uses it is
 * `invoices/overdue-remind.handler.ts` (its rules: `overdue-remind.ts`).
 */

export interface OverdueTiming {
    /** Whole days after the due date the first reminder goes on. */
    firstDay: number;
    /** The same for the second, always after the first. */
    secondDay: number;
    /** The first hour of the day reminders may go in: 9 is 9:00. */
    fromHour: number;
    /** The hour they stop at, not included: 20 means before 8 pm. */
    untilHour: number;
}

/** Days 3 and 10, from 9 am to 8 pm: as before the business could choose. */
export const DEFAULT_OVERDUE_TIMING: Readonly<OverdueTiming> = {
    firstDay: 3,
    secondDay: 10,
    fromHour: 9,
    untilHour: 20,
};

/** The days a reminder may be set to, and the hours (the CHECKs match). */
export const OVERDUE_FIRST_DAY_MAX = 30;
export const OVERDUE_SECOND_DAY_MAX = 60;

/** Whether a choice is the default one, so no row is kept for it. */
export function isDefaultTiming(t: OverdueTiming): boolean {
    return (
        t.firstDay === DEFAULT_OVERDUE_TIMING.firstDay &&
        t.secondDay === DEFAULT_OVERDUE_TIMING.secondDay &&
        t.fromHour === DEFAULT_OVERDUE_TIMING.fromHour &&
        t.untilHour === DEFAULT_OVERDUE_TIMING.untilHour
    );
}

const whole = (n: unknown): n is number =>
    typeof n === "number" && Number.isInteger(n);

/**
 * What is wrong with a timing, in the merchant's words, or null. The DTO
 * checks each number alone; this checks them together.
 */
export function overdueTimingProblem(t: OverdueTiming): string | null {
    if (
        !whole(t.firstDay) ||
        t.firstDay < 1 ||
        t.firstDay > OVERDUE_FIRST_DAY_MAX
    ) {
        return `The first reminder goes 1 to ${OVERDUE_FIRST_DAY_MAX} days after the due date.`;
    }
    if (
        !whole(t.secondDay) ||
        t.secondDay <= t.firstDay ||
        t.secondDay > OVERDUE_SECOND_DAY_MAX
    ) {
        return `The second reminder goes after the first, at most ${OVERDUE_SECOND_DAY_MAX} days after the due date.`;
    }
    if (
        !whole(t.fromHour) ||
        !whole(t.untilHour) ||
        t.fromHour < 0 ||
        t.untilHour > 24 ||
        t.untilHour <= t.fromHour
    ) {
        return "Reminders stop later in the day than they start.";
    }
    return null;
}

/** "9 am", "noon", "8 pm", "midnight" (0 and 24 both). */
export function hourWords(hour: number): string {
    if (hour === 0 || hour === 24) return "midnight";
    if (hour === 12) return "noon";
    return hour < 12 ? `${hour} am` : `${hour - 12} pm`;
}

/** The switch's sentence, with the business's own days and hours. */
export function overdueSays(t: OverdueTiming): string {
    return `Up to 2 reminders for an unpaid invoice, ${t.firstDay} and ${t.secondDay} days after it's due, from ${hourWords(t.fromHour)} to ${hourWords(t.untilHour)} your time.`;
}

/** Anything that can read the timing: `prisma` or a transaction. */
export type OverdueTimingReader = Pick<
    Prisma.TransactionClient,
    "overdueReminderTiming"
>;

/** The business's timing: its row, else the defaults. */
export async function overdueTiming(
    tx: OverdueTimingReader,
    organizationId: string,
): Promise<OverdueTiming> {
    const row = await tx.overdueReminderTiming.findUnique({
        where: { organizationId },
        select: {
            firstDay: true,
            secondDay: true,
            fromHour: true,
            untilHour: true,
        },
    });
    return row ?? { ...DEFAULT_OVERDUE_TIMING };
}

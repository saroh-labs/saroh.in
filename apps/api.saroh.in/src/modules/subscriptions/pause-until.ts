import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { DateTime } from "luxon";

import { paymentsOn } from "../invoices/payments-on";
import type { PauseSubscriptionDto } from "./dto";
import type {
    SubscriptionEventData,
    SubscriptionEventLog,
} from "./subscription-events";
import { JOB, subscriptionEventLog } from "./subscription-events";

/**
 * A pause with an end date (plan 2026-09-26-004, D8).
 *
 * A pause either runs until someone resumes it (`pausedUntil` null, staff
 * only), or has an end date: the start of that day in the subscription's
 * timezone. The renewal job picks a paused subscription up on that date and
 * resumes it through the same code as a manual resume, so ADR-007's rules
 * hold, judged by the end date rather than the hour the job runs: ending on
 * or before the paid period's end, the period moves later by the days
 * paused; ending after it, a new period starts on the end date with its
 * invoice. That second one bills, so
 * with Payments off it is refused: the job leaves it paused, writes one
 * RESUME_REFUSED for this pause, and Home raises it until Payments is back
 * on, when the next run resumes it.
 */

/** The furthest ahead a pause's end date may be. */
export const PAUSE_MAX_DAYS = 366;

type Tx = Prisma.TransactionClient;

function refuse(message: string): never {
    throw new BadRequestException({ message, details: { field: "until" } });
}

/**
 * When a pause chosen now ends: the start of the day `weeks` weeks from
 * today, or of the day named, in the subscription's timezone; null for a
 * pause until someone resumes it. A day named must be after today and
 * within {@link PAUSE_MAX_DAYS}.
 */
export function pauseEnd(
    choice: PauseSubscriptionDto,
    now: Date,
    timezone: string,
): Date | null {
    const today = DateTime.fromJSDate(now, { zone: timezone }).startOf("day");
    if (choice.weeks !== undefined && choice.until !== undefined) {
        refuse("Choose a number of weeks or a date, not both");
    }
    if (choice.weeks !== undefined) {
        return today.plus({ weeks: choice.weeks }).toJSDate();
    }
    if (!choice.until) return null;
    const day = DateTime.fromISO(choice.until, { zone: timezone });
    if (!day.isValid) refuse("That date doesn't exist");
    if (day <= today) refuse("Choose a day after today");
    if (day > today.plus({ days: PAUSE_MAX_DAYS })) {
        refuse("A pause can last a year at most");
    }
    return day.startOf("day").toJSDate();
}

/** What a PAUSED event says about how long: `until`, or null for open-ended. */
export function pausedEventData(until: Date | null): SubscriptionEventData {
    return { until: until?.toISOString() ?? null };
}

/**
 * The days a pause with an end date took, as calendar days in the
 * subscription's zone: from the day it was paused to the day it resumes.
 * A 4-week pause from 1 Oct is 28 days, whatever hour it was paused at or
 * the job ran at.
 */
export function pausedDays(
    pausedAt: Date,
    pausedUntil: Date,
    timezone: string,
): number {
    const from = DateTime.fromJSDate(pausedAt, { zone: timezone }).startOf(
        "day",
    );
    const to = DateTime.fromJSDate(pausedUntil, { zone: timezone }).startOf(
        "day",
    );
    return Math.max(0, Math.round(to.diff(from, "days").days));
}

/** The renewal job's where for a pause whose end date has come. */
export function pauseEndedWhere(
    now: Date,
): Prisma.CustomerSubscriptionWhereInput {
    return { status: "PAUSED", pausedUntil: { lte: now } };
}

export interface PausedRow {
    id: string;
    organizationId: string;
    status: string;
    pausedAt: Date | null;
    pausedUntil: Date | null;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
    timezone: string;
}

/** Paused, with an end date that has come. */
export function pauseHasEnded(sub: PausedRow, now: Date): boolean {
    return (
        sub.status === "PAUSED" &&
        sub.pausedAt !== null &&
        sub.pausedUntil !== null &&
        sub.pausedUntil <= now
    );
}

/** How a pause that reached its end date resumes, decided from its dates. */
export interface PauseEnded {
    /** Calendar days the pause took. */
    days: number;
    /** It ended on or before the paid period's end: that period moves later. */
    extends: boolean;
    /** The day it ended: a restart's new period starts then. */
    on: Date;
}

/**
 * Extend or restart, from the dates alone (review S-3): a pause ending on
 * or before the paid period's end moves that end later by the days paused;
 * one ending after it starts a new period on its end date. When the job
 * gets to it doesn't come into it, so a late run lands where an on-time
 * one would have.
 */
export function pauseEnded(sub: {
    pausedAt: Date;
    pausedUntil: Date;
    currentPeriodEnd: Date;
    timezone: string;
}): PauseEnded {
    return {
        days: pausedDays(sub.pausedAt, sub.pausedUntil, sub.timezone),
        extends: sub.pausedUntil <= sub.currentPeriodEnd,
        on: sub.pausedUntil,
    };
}

/**
 * Resume one whose pause has ended, as the renewal job, under the row lock
 * the caller holds. `resume` is the manual resume's own code, given the
 * job's log and how the pause ends ({@link pauseEnded}).
 *
 * A restart past the paid period with Payments off is refused: nothing
 * changes but one RESUME_REFUSED for this pause, so the hourly run that
 * finds it again writes nothing twice. A redelivered run finds it resumed
 * (no longer paused) and does nothing.
 */
export async function resumeWhenDue(
    tx: Tx,
    sub: PausedRow,
    now: Date,
    resume: (log: SubscriptionEventLog, ended: PauseEnded) => Promise<void>,
): Promise<"resumed" | "refused" | "skipped"> {
    if (!pauseHasEnded(sub, now) || !sub.pausedAt || !sub.pausedUntil) {
        return "skipped";
    }
    const log = subscriptionEventLog(tx, sub.organizationId, sub.id, JOB);
    const ended = pauseEnded({
        pausedAt: sub.pausedAt,
        pausedUntil: sub.pausedUntil,
        currentPeriodEnd: sub.currentPeriodEnd,
        timezone: sub.timezone,
    });
    const restarts = !ended.extends && !sub.cancelAtPeriodEnd;
    if (restarts && !(await paymentsOn(tx, sub.organizationId))) {
        const said = await tx.subscriptionEvent.findFirst({
            where: {
                organizationId: sub.organizationId,
                subscriptionId: sub.id,
                kind: "RESUME_REFUSED",
                createdAt: { gte: sub.pausedAt },
            },
            select: { id: true },
        });
        if (!said) {
            await log("RESUME_REFUSED", {
                data: {
                    until: sub.pausedUntil.toISOString(),
                    reason: "PAYMENTS_OFF",
                },
            });
        }
        return "refused";
    }
    await resume(log, ended);
    return "resumed";
}

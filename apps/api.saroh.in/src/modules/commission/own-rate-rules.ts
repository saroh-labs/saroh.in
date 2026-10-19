import type { LineStatus } from "./commission-rules";
import { IST_OFFSET_MS, nextStatus } from "./commission-rules";

/**
 * A business's own rate (DEC-169, #1035): a rate set for the manager who
 * looks after one business, earning from an "Earns from" day (the start of
 * that day in India) up to an optional end. It wins over the general rate
 * for the link's kind, and saving it is the only back-pay there is: the
 * manager's NO_RATE lines for payments in its window are priced at it,
 * once. Lines a general rate already priced are left as they are.
 */

const DAY = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Whether `value` is a day as the console sends it ("2026-09-10"). */
export function isDay(value: unknown): value is string {
    if (typeof value !== "string" || !DAY.test(value)) return false;
    const at = new Date(`${value}T00:00:00.000Z`);
    return at.toISOString().slice(0, 10) === value;
}

/** The day `at` falls on, in India ("2026-09-10"). */
export function dayOf(at: Date): string {
    return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Where `day` starts in India, as an instant. */
export function dayStart(day: string): Date {
    if (!isDay(day)) throw new RangeError("Not a day");
    return new Date(Date.parse(`${day}T00:00:00.000Z`) - IST_OFFSET_MS);
}

/** The day after `day`. */
export function nextDay(day: string): string {
    if (!isDay(day)) throw new RangeError("Not a day");
    return new Date(Date.parse(`${day}T00:00:00.000Z`) + 86_400_000)
        .toISOString()
        .slice(0, 10);
}

/** "10 Sep 2026", for a refusal. */
export function dayWords(day: string): string {
    return new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    }).format(new Date(`${day}T00:00:00.000Z`));
}

/** The first day of the month `day` is in ("2027-01-20" → "2027-01-01"). */
export function monthStartDay(day: string): string {
    return `${day.slice(0, 7)}-01`;
}

/** "Jan 2027", for a refusal. */
export function monthWords(day: string): string {
    return new Intl.DateTimeFormat("en-IN", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    }).format(new Date(`${monthStartDay(day)}T00:00:00.000Z`));
}

/**
 * The earliest day an own rate can earn from (owner, 19 Oct): the later of
 * the business's first paid plan and the first day of the month (in India)
 * its manager took it on. A business that joined with no manager earns its
 * manager nothing until they are added, and "the month counts": one that
 * joined on 1 Nov on Pro and was given Arjun on 1 Jan (or on 20 Jan) earns
 * Arjun January, paid on 31 Jan, and nothing for November or December.
 * Null when it has paid for nothing yet.
 */
export function ownRateFloor(input: {
    firstPaidAt: Date | null;
    managerSince: Date | null;
}): { day: string; by: "first-paid" | "manager" } | null {
    if (!input.firstPaidAt) return null;
    const paid = dayOf(input.firstPaidAt);
    const since = input.managerSince
        ? monthStartDay(dayOf(input.managerSince))
        : null;
    return since !== null && since >= paid
        ? { day: since, by: "manager" }
        : { day: paid, by: "first-paid" };
}

/**
 * Why an own rate can't earn over these days, or null when it can. The
 * earliest day is `ownRateFloor`'s: the business's first paid plan (the
 * day its first Saroh payment with an amount before GST cleared, which is
 * how every commission line is dated: `issuedAt`, `taxablePaise > 0`), or
 * the first day of the month the manager the rate is for took it on,
 * whichever is later. A
 * business with no paid plan yet gets no own rate at all.
 */
export function ownRateWindowProblem(input: {
    earnsFrom: string;
    lastDay: string | null;
    firstPaidAt: Date | null;
    /** The manager the rate is for, and when their link started. */
    manager: { name: string; since: Date } | null;
}): string | null {
    if (!isDay(input.earnsFrom)) return "Pick the day it earns from.";
    if (input.lastDay !== null && !isDay(input.lastDay)) {
        return "Pick its last day, or leave it empty.";
    }
    const floor = ownRateFloor({
        firstPaidAt: input.firstPaidAt,
        managerSince: input.manager?.since ?? null,
    });
    if (!floor) {
        return "This business hasn't paid for a plan yet. Its own rate can be set once it has.";
    }
    if (input.earnsFrom < floor.day) {
        return floor.by === "manager" && input.manager
            ? `${input.manager.name} took it on in ${monthWords(floor.day)}. A rate can start from ${dayWords(floor.day)}, the start of that month.`
            : `It can earn from ${dayWords(floor.day)} at the earliest, the day of its first paid plan.`;
    }
    if (input.lastDay !== null && input.lastDay < input.earnsFrom) {
        return "Its last day comes before the day it earns from.";
    }
    return null;
}

/** An own rate's window: from `earnsFrom`, up to `until` (exclusive) if set. */
export interface OwnRateWindow {
    id: string;
    platformAdminId: string;
    earnsFrom: Date;
    until: Date | null;
}

/** It earns for no moment at all: ended on the day it would have started. */
export function isEmptyWindow(
    rate: Pick<OwnRateWindow, "earnsFrom" | "until">,
) {
    return (
        rate.until !== null && rate.until.getTime() <= rate.earnsFrom.getTime()
    );
}

/** Whether `rate` prices a payment `platformAdminId`'s link earned at `at`. */
export function ownRateCovers(
    rate: OwnRateWindow,
    platformAdminId: string,
    at: Date,
): boolean {
    return (
        rate.platformAdminId === platformAdminId &&
        rate.earnsFrom.getTime() <= at.getTime() &&
        (rate.until === null || rate.until.getTime() > at.getTime())
    );
}

/**
 * What a new own rate from `from` does to the business's others, so one is
 * in force at a time: one that runs past `from` ends there, and one that
 * starts on or after it is ended before it began (its `until` its own
 * start). Either keeps every line it already priced: priced lines are
 * never priced again. Ended ones and empty ones are left alone.
 */
export function ownRateOverlap(
    existing: readonly OwnRateWindow[],
    from: Date,
): { id: string; until: Date }[] {
    return existing
        .filter((r) => !isEmptyWindow(r))
        .filter((r) => r.until === null || r.until.getTime() > from.getTime())
        .map((r) => ({
            id: r.id,
            until: r.earnsFrom.getTime() >= from.getTime() ? r.earnsFrom : from,
        }));
}

/**
 * When End… stops an own rate: now, or, for one that hasn't started, its
 * start (so it never earns). Null when it has already stopped.
 */
export function ownRateEndAt(
    rate: Pick<OwnRateWindow, "earnsFrom" | "until">,
    now: Date,
): Date | null {
    const at = rate.earnsFrom.getTime() > now.getTime() ? rate.earnsFrom : now;
    if (rate.until !== null && rate.until.getTime() <= at.getTime()) {
        return null;
    }
    return at;
}

/**
 * Where a NO_RATE line goes when an own rate prices it: on as a fresh
 * line would (HELD on a mismatch, PENDING while a refund or dispute is
 * open or its period runs, PAYABLE once it ended clean), or nowhere (null)
 * when the money went back: a refunded payment earns nothing either way.
 */
export function backPayStatus(facts: {
    refund: "cancel" | "wait" | "none";
    held: boolean;
    periodEnded: boolean;
}): LineStatus | null {
    if (facts.refund === "cancel") return null;
    return nextStatus({ status: "PENDING", rated: true, ...facts });
}

/** The one legal way out of NO_RATE: an own rate's back-pay, to an open state. */
export function isLegalBackPay(from: LineStatus, to: LineStatus): boolean {
    return (
        from === "NO_RATE" &&
        (to === "PENDING" || to === "HELD" || to === "PAYABLE")
    );
}

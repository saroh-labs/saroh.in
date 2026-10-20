import { formatDay, localDateKey } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";

import type { OwedAge } from "./reads";

/**
 * The bills in one age of "Who owes me?" (DEC-171, plan U12, #1093;
 * `IBOwedD`, `IBOwedP`), picked from the Invoices list the way the API's
 * owed by age counts them (`modules/analytics/owed-by-age.ts`): issued,
 * not an order's own, not a credit note, by what is left to pay; not due
 * (no due date, or due from now on), 1 to 30 days late, more than 30.
 * Pure: tested in `owed-bills.test.ts`.
 */

/** Past due by more than this many days is "more than 30 days late". */
export const LATE_LONG_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The fields of an invoice the age needs (`lib/invoices/service.ts`). */
export interface OwedInvoice {
    id: string;
    number: string | null;
    status: string;
    kind?: string;
    source: string;
    currency: string;
    total: string;
    leftToPay?: string;
    dueAt: string | null;
    contact: { name: string } | null;
    billTo: { name: string | null } | null;
    summary: { description: string } | null;
}

/** One bill in an age's sheet. */
export interface OwedBillRow {
    id: string;
    /** Who owes it. */
    who: string;
    /** "RC/26-27/0056 · was due 20 Sep · 29 days late". */
    line: string;
    /** What is left to pay, in minor units. */
    leftMinor: number;
    currency: string;
    /** Days past due; 0 when not due. */
    daysLate: number;
}

/** How late a bill is at `now`, as the API's owed by age counts it. */
export function owedAgeOf(dueAt: string | null, now: Date): OwedAge {
    if (dueAt === null) return "notDue";
    const due = new Date(dueAt).getTime();
    if (due >= now.getTime()) return "notDue";
    if (due >= now.getTime() - LATE_LONG_DAYS * DAY_MS) return "late1to30";
    return "lateOver30";
}

const minorOf = (amount: string) => Math.round(Number(amount) * 100);

/**
 * The bills of `age`, most late first, then the most owed: what someone
 * chasing them reads first.
 */
export function owedBills(
    invoices: readonly OwedInvoice[],
    age: OwedAge,
    now: Date,
    /** The business's zone: a due date is its day there. */
    zone: string,
): OwedBillRow[] {
    return invoices
        .filter(
            (i) =>
                i.status === "ISSUED" &&
                i.source !== "ORDER" &&
                (i.kind ?? "INVOICE") !== "CREDIT_NOTE" &&
                owedAgeOf(i.dueAt, now) === age,
        )
        .map((i) => {
            const leftMinor = minorOf(i.leftToPay ?? i.total);
            const daysLate =
                i.dueAt && new Date(i.dueAt).getTime() < now.getTime()
                    ? Math.max(
                          1,
                          Math.floor(
                              (now.getTime() - new Date(i.dueAt).getTime()) /
                                  DAY_MS,
                          ),
                      )
                    : 0;
            const day = i.dueAt
                ? formatDay(localDateKey(new Date(i.dueAt), zone), {
                      year: "never",
                  })
                : null;
            const due = day
                ? daysLate > 0
                    ? `was due ${day} · ${count(daysLate, "day")} late`
                    : `due ${day}`
                : "no due date";
            const what = i.number ?? i.summary?.description ?? "Invoice";
            return {
                id: i.id,
                who: i.contact?.name ?? i.billTo?.name ?? "No name",
                line: `${what} · ${due}`,
                leftMinor,
                currency: i.currency,
                daysLate,
            };
        })
        .filter((b) => b.leftMinor > 0)
        .sort((a, b) => b.daysLate - a.daysLate || b.leftMinor - a.leftMinor);
}

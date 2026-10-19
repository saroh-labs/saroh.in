/**
 * Commission's rules (DEC-169, admin console U21), pure so each is pinned
 * by a unit spec without a database. No rate lives here or anywhere in the
 * code: a rate is a `CommissionRate` row, set in the console, and every
 * function below takes it as an argument.
 */

/** A line's state. `CommissionLine_status_check` holds the same list. */
export const LINE_STATUSES = [
    "PENDING",
    "HELD",
    "NO_RATE",
    "PAYABLE",
    "CANCELLED",
    "PAID",
] as const;
export type LineStatus = (typeof LINE_STATUSES)[number];

/** The kinds a rate is set for, as `AccountManagerLink.kind`. */
export const RATE_KINDS = ["BROUGHT_IN", "ASSIGNED"] as const;
export type RateKind = (typeof RATE_KINDS)[number];

/** The most a rate can be: all of it, in basis points. */
export const MAX_BASIS_POINTS = 10_000;

/** Lines the job and the sweep still move; the other two never change. */
export const OPEN_STATUSES: readonly LineStatus[] = [
    "PENDING",
    "HELD",
    "NO_RATE",
    "PAYABLE",
];

/**
 * What a payment before GST earns at a rate, in whole paise, rounded half
 * up once. Integer arithmetic only (KTD-18).
 */
export function commissionPaise(
    basePaise: number,
    basisPoints: number,
): number {
    if (!Number.isInteger(basePaise) || basePaise < 0) {
        throw new RangeError("The amount must be whole paise, not below zero");
    }
    if (
        !Number.isInteger(basisPoints) ||
        basisPoints < 0 ||
        basisPoints > MAX_BASIS_POINTS
    ) {
        throw new RangeError("A rate is 0 to 10000 basis points");
    }
    return Math.floor((basePaise * basisPoints + 5_000) / 10_000);
}

/**
 * `total` in `parts` whole shares that add up to it exactly: equal, with
 * the paise left over going one each to the first shares.
 */
export function splitEvenly(total: number, parts: number): number[] {
    if (!Number.isInteger(parts) || parts < 1) {
        throw new RangeError("Split into at least one part");
    }
    const share = Math.floor(total / parts);
    const left = total - share * parts;
    return Array.from({ length: parts }, (_, i) => share + (i < left ? 1 : 0));
}

/**
 * How many lines a payment makes: a year paid at once earns one twelfth
 * each month (owner, 19 Oct 2026); anything else, one.
 */
export function installmentsOf(cycle: string): number {
    return cycle === "year" ? 12 : 1;
}

/** `at` plus `months` calendar months, the day kept (or the month's last). */
export function addMonths(at: Date, months: number): Date {
    const y = at.getUTCFullYear();
    const m = at.getUTCMonth() + months;
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const out = new Date(at.getTime());
    out.setUTCFullYear(y, m, Math.min(at.getUTCDate(), lastDay));
    return out;
}

/**
 * When each line of a payment can become payable: the end of the period
 * it pays for, or for a year paid at once, the end of each of its months
 * (the last one the period's own end).
 */
export function installmentEnds(input: {
    periodStart: Date;
    periodEnd: Date;
    installments: number;
}): Date[] {
    const { periodStart, periodEnd, installments } = input;
    if (installments === 1) return [periodEnd];
    return Array.from({ length: installments }, (_, i) =>
        i === installments - 1 ? periodEnd : addMonths(periodStart, i + 1),
    );
}

/** India's offset from UTC; India keeps no summer time. */
const IST_OFFSET_MS = 330 * 60 * 1000;

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Whether `value` is a statement month ("2026-12"). */
export function isMonth(value: unknown): value is string {
    return typeof value === "string" && MONTH.test(value);
}

/** The month `at` falls in, in India ("2026-12"). */
export function monthOf(at: Date): string {
    return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 7);
}

/** The month after `month`. */
export function nextMonth(month: string): string {
    const m = MONTH.exec(month);
    if (!m) throw new RangeError(`Not a month: ${month}`);
    const year = Number(m[1]);
    const index = Number(m[2]); // 1..12, so this is the next month's 0-based index
    return new Date(Date.UTC(year, index, 1)).toISOString().slice(0, 7);
}

/** Where `month` starts and the next one starts, in India, as instants. */
export function monthBounds(month: string): { from: Date; to: Date } {
    if (!isMonth(month)) throw new RangeError("Not a statement month");
    const start = (m: string) =>
        new Date(Date.parse(`${m}-01T00:00:00.000Z`) - IST_OFFSET_MS);
    return { from: start(month), to: start(nextMonth(month)) };
}

/**
 * The statement a line that became payable goes in: the month its period
 * ended in (a period of 21 Nov to 20 Dec is paid with December's, on
 * 31 Dec), or, when that month is already paid and so locked, the first
 * month after it that isn't.
 */
export function statementMonthFor(
    periodEnd: Date,
    paidMonths: ReadonlySet<string>,
): string {
    let month = monthOf(periodEnd);
    while (paidMonths.has(month)) month = nextMonth(month);
    return month;
}

/** A refund or dispute on the payment, as `BillingRefund` keeps it. */
export interface RefundState {
    kind: string;
    status: string;
}

/**
 * What the refunds and disputes on a payment mean for its commission:
 *
 * - `cancel`: money went back (a refund PROCESSED, a dispute LOST);
 * - `wait`: it may yet (a refund PENDING, a dispute still open), so the
 *   line is not paid until it is settled;
 * - `none`: a FAILED refund, a dispute WON or CLOSED, or nothing at all.
 */
export function refundSignal(
    refunds: readonly RefundState[],
): "cancel" | "wait" | "none" {
    let wait = false;
    for (const r of refunds) {
        if (r.kind === "DISPUTE") {
            if (r.status === "LOST") return "cancel";
            if (r.status !== "WON" && r.status !== "CLOSED") wait = true;
        } else {
            if (r.status === "PROCESSED") return "cancel";
            if (r.status === "PENDING") wait = true;
        }
    }
    return wait ? "wait" : "none";
}

export interface LineFacts {
    status: LineStatus;
    refund: "cancel" | "wait" | "none";
    /** A rate has been worked into the line (or can be now). */
    rated: boolean;
    /** The provider took a different amount and nobody has resolved it. */
    held: boolean;
    /** The period (or month) it pays for has ended. */
    periodEnded: boolean;
}

/**
 * Where a line goes next. CANCELLED and PAID never move: a refund after
 * payout is the owner's to raise (`refundAfterPayout`), nothing is taken
 * back. Otherwise, in this order: money went back → CANCELLED; no rate →
 * NO_RATE; the amount doesn't match → HELD; a refund or dispute open →
 * PENDING; the period ended → PAYABLE; else PENDING.
 */
export function nextStatus(facts: LineFacts): LineStatus {
    if (facts.status === "CANCELLED" || facts.status === "PAID") {
        return facts.status;
    }
    if (facts.refund === "cancel") return "CANCELLED";
    if (!facts.rated) return "NO_RATE";
    if (facts.held) return "HELD";
    if (facts.refund === "wait") return "PENDING";
    return facts.periodEnded ? "PAYABLE" : "PENDING";
}

/** A refund that came after the line was paid: raised, never deducted. */
export function refundAfterPayout(facts: LineFacts): boolean {
    return facts.status === "PAID" && facts.refund === "cancel";
}

/**
 * The moves a line can make. PAYABLE → PAID is Mark paid's alone; the job
 * and the sweep move the rest. Nothing leaves CANCELLED or PAID.
 */
export function isLegalLineMove(from: LineStatus, to: LineStatus): boolean {
    if (from === to) return true;
    if (from === "CANCELLED" || from === "PAID") return false;
    if (to === "PAID") return from === "PAYABLE";
    return true;
}

/** A rate given as a percentage with up to two decimals, in basis points. */
export function basisPointsOfPercent(percent: string): number | null {
    const typed = percent.trim();
    if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(typed)) return null;
    const [whole, decimals = ""] = typed.split(".");
    const bps = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
    return bps <= MAX_BASIS_POINTS ? bps : null;
}

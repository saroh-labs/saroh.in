import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { DateTime } from "luxon";

type Sequencer = Pick<Prisma.TransactionClient, "invoiceSequence" | "invoice">;

export type InvoiceKind = "INVOICE" | "CREDIT_NOTE" | "SUPPLEMENTARY";

/** GST's limit on an invoice number (CGST Rules, rule 46). */
export const MAX_NUMBER_LENGTH = 16;

/** What rule 46 lets an invoice number carry: capitals, digits, "-" and "/". */
const NUMBER_CHARS = /^[A-Z0-9/-]+$/;

/** The zone a business without one keeps its financial year in. */
export const DEFAULT_TIMEZONE = "Asia/Kolkata";

const PREFIX_RE = /^[A-Z0-9]{1,3}$/;

/** 1 → "INV-0001". Past 9999 it simply grows: "INV-10000". */
export function formatInvoiceNumber(n: number): string {
    return `INV-${String(n).padStart(4, "0")}`;
}

/** Where numbers come from, and how one is written. */
export interface InvoiceSeries {
    /** The `InvoiceSequence.series` it counts in. */
    key: string;
    /** Everything a number carries before its counter: "RC/26-27/". */
    stem: string;
    format(n: number): string;
}

/**
 * The series every business had before ADR-008, and the one a business that
 * never chose a prefix stays in: its existing numbers carry on.
 */
export const LEGACY_SERIES: InvoiceSeries = {
    key: "INV",
    stem: "INV-",
    format: formatInvoiceNumber,
};

/**
 * Why a prefix is refused, or null. One to three capitals or digits; the
 * business's number format is then checked whole ({@link numberFormatProblem}),
 * so the longest number it makes stays within GST's 16 characters.
 */
export function prefixProblem(prefix: string): string | null {
    if (prefix.length < 1 || prefix.length > 3) {
        return "A prefix is one to three characters, like RC.";
    }
    if (/[a-z]/.test(prefix)) return "Use capital letters, like RC.";
    if (!PREFIX_RE.test(prefix)) {
        return "A prefix is letters and digits only, like RC.";
    }
    return null;
}

/**
 * The Indian financial year a moment falls in, April to March, as the short
 * form a number carries: 23 September 2026 → "26-27". Fixed by GST law for
 * every business. Read in the business's own zone, so an invoice at ten past
 * midnight on 1 April is next year's.
 */
export function financialYear(
    at: Date,
    timezone: string = DEFAULT_TIMEZONE,
): string {
    const local = DateTime.fromJSDate(at, { zone: timezone });
    const start = local.month >= 4 ? local.year : local.year - 1;
    const yy = (y: number) => String(y % 100).padStart(2, "0");
    return `${yy(start)}-${yy(start + 1)}`;
}

// ── The business's number format ────────────────────────────────────────────

/** The parts a number can carry before its counter, in the order chosen. */
export const NUMBER_PARTS = ["PREFIX", "FY", "YEAR", "MONTH"] as const;
export type NumberPart = (typeof NUMBER_PARTS)[number];

export const NUMBER_SEPARATORS = ["/", "-"] as const;
export type NumberSeparator = (typeof NUMBER_SEPARATORS)[number];

/** When the counter starts again at 1. */
export const NUMBER_RESTARTS = ["FY", "MONTH", "NEVER"] as const;
export type NumberRestart = (typeof NUMBER_RESTARTS)[number];

export const MIN_COUNTER_DIGITS = 3;
export const MAX_COUNTER_DIGITS = 6;

/**
 * How a business's invoice numbers are built: the parts in its order, joined
 * by one separator, then the counter, zero-padded to `digits` (it grows past
 * them rather than wrap). Stored as `BusinessProfile.invoiceNumberFormat`;
 * absent, {@link defaultNumberFormat}.
 */
export interface NumberFormat {
    parts: NumberPart[];
    separator: NumberSeparator;
    digits: number;
    restart: NumberRestart;
}

/**
 * The format of a business that never chose one — exactly the numbers every
 * business had before it could: registered, RC/26-27/0001 restarting each
 * financial year; not, RC-0001 on one running counter. With no prefix the
 * prefix prints as INV, the legacy series.
 */
export function defaultNumberFormat(registered: boolean): NumberFormat {
    return registered
        ? { parts: ["PREFIX", "FY"], separator: "/", digits: 4, restart: "FY" }
        : { parts: ["PREFIX"], separator: "-", digits: 4, restart: "NEVER" };
}

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
    typeof v === "string" && (list as readonly string[]).includes(v);

/**
 * A stored format, or null when there is none or it is not one — the
 * business then numbers by the default. Shape only: the rules are
 * {@link numberFormatProblem}'s, checked when it was saved.
 */
export function readNumberFormat(value: unknown): NumberFormat | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const v = value as Record<string, unknown>;
    if (
        !Array.isArray(v.parts) ||
        !v.parts.every((p) => isOneOf(NUMBER_PARTS, p)) ||
        new Set(v.parts).size !== v.parts.length ||
        !isOneOf(NUMBER_SEPARATORS, v.separator) ||
        !isOneOf(NUMBER_RESTARTS, v.restart) ||
        typeof v.digits !== "number" ||
        !Number.isInteger(v.digits) ||
        v.digits < MIN_COUNTER_DIGITS ||
        v.digits > MAX_COUNTER_DIGITS
    ) {
        return null;
    }
    return {
        parts: v.parts,
        separator: v.separator,
        digits: v.digits,
        restart: v.restart,
    };
}

/**
 * The format a business numbers by: the one it chose, else the default for
 * its standing. A registered business never runs one counter forever
 * (saving refuses it); should a stored "never" meet one anyway, its counter
 * restarts each financial year.
 */
export function numberFormatFor(
    stored: unknown,
    registered: boolean,
): NumberFormat {
    const format = readNumberFormat(stored) ?? defaultNumberFormat(registered);
    return registered && format.restart === "NEVER"
        ? { ...format, restart: "FY" }
        : format;
}

/** The form fields a format problem is about (or the prefix's). */
export type NumberFormatField =
    "invoiceNumberParts" | "invoiceNumberRestart" | "invoiceNumberDigits";

/** The prefix a number prints: the business's, else the legacy INV. */
const printedPrefix = (prefix: string | null) => prefix ?? LEGACY_SERIES.key;

/** What marks a credit note, so none can share an invoice's number. */
const CREDIT_MARK = "CN";

/**
 * How a credit note's number differs from an invoice's in a format:
 *
 *  - "after": "CN" follows the prefix — RCCN/26-27/0001, as credit notes
 *    were always numbered — whenever that fits in 16 characters;
 *  - "instead": where it would not (RCCN/26-27/09/0001 is 18), "CN" takes
 *    the prefix's place — CN/26-27/09/0001, the invoice's length;
 *  - "first": a number with no prefix leads with "CN" — CN/26-27/0001.
 */
export type CreditMark = "after" | "instead" | "first";

export function creditMark(
    format: NumberFormat,
    prefix: string | null,
): CreditMark {
    if (!format.parts.includes("PREFIX")) return "first";
    const after = build(format, {
        prefix,
        kind: "CREDIT_NOTE",
        at: new Date(),
        mark: "after",
    });
    return after.length + format.digits <= MAX_NUMBER_LENGTH
        ? "after"
        : "instead";
}

/** A number's stem — every part before the counter, and a separator. */
function build(
    format: NumberFormat,
    input: {
        prefix: string | null;
        kind: InvoiceKind;
        at: Date;
        timezone?: string | null;
        mark: CreditMark;
    },
): string {
    const credit = input.kind === "CREDIT_NOTE";
    const zone = input.timezone ?? DEFAULT_TIMEZONE;
    const local = DateTime.fromJSDate(input.at, { zone });
    const values = format.parts.map((part) => {
        switch (part) {
            case "PREFIX":
                if (!credit) return printedPrefix(input.prefix);
                return input.mark === "instead"
                    ? CREDIT_MARK
                    : `${printedPrefix(input.prefix)}${CREDIT_MARK}`;
            case "FY":
                return financialYear(input.at, zone);
            case "YEAR":
                return String(local.year);
            case "MONTH":
                return String(local.month).padStart(2, "0");
        }
    });
    const parts =
        credit && input.mark === "first" ? [CREDIT_MARK, ...values] : values;
    return parts.map((p) => `${p}${format.separator}`).join("");
}

/**
 * The longest number a format can print, invoice or credit note, with the
 * counter at its most digits. Its length does not depend on the date —
 * every part is fixed-width.
 */
export function longestNumber(
    format: NumberFormat,
    prefix: string | null,
    at: Date = new Date(),
): string {
    const counter = "9".repeat(format.digits);
    const mark = creditMark(format, prefix);
    const number = (kind: InvoiceKind) =>
        `${build(format, { prefix, kind, at, mark })}${counter}`;
    const invoice = number("INVOICE");
    const credit = number("CREDIT_NOTE");
    return credit.length > invoice.length ? credit : invoice;
}

/**
 * Why a format is refused for a business, or null (ADR-008):
 *
 *  - only a business that is not GST-registered may run one counter
 *    forever — GST expects a series per financial year;
 *  - numbers must never repeat, for the business, across every year (the
 *    database holds one number once): a counter that restarts each year
 *    needs the financial year or the year in the number; one that
 *    restarts each month, the month and one of them;
 *  - the longest number it can print, invoice or credit note, is at most 16
 *    characters of A–Z, 0–9, "-" and "/" (rules 46 and 53);
 *  - where "CN" takes the prefix's place on credit notes, the prefix is not
 *    "CN" itself.
 */
export function numberFormatProblem(
    format: NumberFormat,
    business: { registered: boolean; prefix: string | null },
): { field: NumberFormatField | "invoicePrefix"; message: string } | null {
    const has = (part: NumberPart) => format.parts.includes(part);
    const yearly = has("FY") || has("YEAR");
    if (format.restart === "NEVER" && business.registered) {
        return {
            field: "invoiceNumberRestart",
            message:
                "A GST-registered business starts its numbers again every financial year or every month.",
        };
    }
    if (format.restart === "MONTH" && !has("MONTH")) {
        return {
            field: "invoiceNumberParts",
            message:
                "Numbers that start again every month need the month in them, or they would repeat.",
        };
    }
    if (format.restart !== "NEVER" && !yearly) {
        return {
            field: "invoiceNumberParts",
            message:
                format.restart === "MONTH"
                    ? "Add the financial year or the year too: the same month comes round every year, and a number must never repeat."
                    : "Numbers that start again every financial year need the financial year or the year in them, or they would repeat.",
        };
    }
    const longest = longestNumber(format, business.prefix);
    if (!NUMBER_CHARS.test(longest)) {
        return {
            field: "invoiceNumberParts",
            message:
                "An invoice number can use only capital letters, digits, - and /.",
        };
    }
    if (longest.length > MAX_NUMBER_LENGTH) {
        return {
            field: "invoiceNumberDigits",
            message: `The longest number this makes, like ${longest}, is ${longest.length} characters. GST allows ${MAX_NUMBER_LENGTH}: use fewer digits or parts.`,
        };
    }
    if (
        creditMark(format, business.prefix) === "instead" &&
        business.prefix === CREDIT_MARK
    ) {
        return {
            field: "invoicePrefix",
            message:
                "In this format CN marks credit notes, so it can't be the prefix too. Choose another.",
        };
    }
    return null;
}

/**
 * The series a document is numbered in (ADR-008), in the business's format:
 *
 *  - by default, registered: prefix + financial year — RC/26-27/0001,
 *    credit notes RCCN/26-27/0001; not registered: a plain prefix —
 *    PF-0001, credit notes PFCN-0001; no prefix: the legacy INV series
 *    (INV-0001; INV/26-27/0001 once registered), credit notes INVCN;
 *  - a chosen format prints its parts in its order with its separator
 *    and digits (RC-2026-09-000001); credit notes carry "CN" after the
 *    prefix where that fits in 16 characters, else in its place
 *    ({@link creditMark}).
 *
 * A supplementary invoice is an invoice and shares the invoices' series.
 *
 * The series — the counter — is the prefix, "CN" for a credit note, and the
 * period the counter restarts in: RC/26-27 each financial year, RC/2026-09
 * each month, RC for a counter that never restarts. Not the rest of the
 * format: a business that changes its parts, separator or digits mid-year
 * carries on counting where it was. What is issued is never renumbered;
 * {@link nextInvoiceNumber} steps past a number already taken.
 */
export function seriesFor(input: {
    registered: boolean;
    prefix: string | null;
    kind: InvoiceKind;
    at: Date;
    timezone?: string | null;
    /** The stored format; absent, the default for the business's standing. */
    format?: unknown;
}): InvoiceSeries {
    const format = numberFormatFor(input.format, input.registered);
    const head = `${printedPrefix(input.prefix)}${input.kind === "CREDIT_NOTE" ? CREDIT_MARK : ""}`;
    const key = seriesKey(head, format.restart, input.at, input.timezone);
    const stem = build(format, {
        ...input,
        mark: creditMark(format, input.prefix),
    });
    const guard = (s: string) => {
        if (s.length > MAX_NUMBER_LENGTH) {
            throw new BadRequestException({
                message: `An invoice number can be at most ${MAX_NUMBER_LENGTH} characters, and this series has run past it. Use fewer parts or a shorter prefix.`,
                details: { field: "invoiceNumberDigits" },
            });
        }
        return s;
    };
    return {
        key,
        stem,
        format: (n) =>
            guard(`${stem}${String(n).padStart(format.digits, "0")}`),
    };
}

/** The counter a head counts in, for the period its format restarts in. */
function seriesKey(
    head: string,
    restart: NumberRestart,
    at: Date,
    timezone?: string | null,
): string {
    const zone = timezone ?? DEFAULT_TIMEZONE;
    if (restart === "FY") return `${head}/${financialYear(at, zone)}`;
    if (restart === "MONTH") {
        return `${head}/${DateTime.fromJSDate(at, { zone }).toFormat("yyyy-MM")}`;
    }
    return head;
}

/**
 * The invoice series' counters for the period `at` is in, one per way of
 * restarting — what the settings read shows the next number from.
 */
export function invoiceSeriesKeys(
    prefix: string | null,
    at: Date,
    timezone?: string | null,
): Record<NumberRestart, string> {
    const head = printedPrefix(prefix);
    return {
        FY: seriesKey(head, "FY", at, timezone),
        MONTH: seriesKey(head, "MONTH", at, timezone),
        NEVER: seriesKey(head, "NEVER", at, timezone),
    };
}

/** How many times a clash is stepped past before giving up. */
const CLASH_ATTEMPTS = 3;

/**
 * The business's next number in a series, taken on the caller's transaction.
 *
 * One statement: an upsert keyed on (organization, series) with no nested
 * writes, which Prisma runs as Postgres's own `INSERT … ON CONFLICT DO
 * UPDATE SET "lastNumber" = "lastNumber" + 1`. The row lock that statement
 * takes is what serialises two issues in one series, so the numbers are
 * distinct without count-and-retry and without depending on the
 * transaction's isolation level — which the RLS proxy may drop. The first
 * number of a series (a new financial year's) needs no row beforehand.
 *
 * A number can still be one the business already issued — its format
 * changed back to one it used, or its counter restarted where the number
 * does not say so. The unique index would refuse it and fail the sale, so
 * the number is checked first and, taken, the counter moves past the
 * highest issued number with the same stem.
 *
 * Taken inside the caller's transaction on purpose: if anything after it
 * fails, the increment rolls back with it and no number is skipped.
 */
export async function nextInvoiceNumber(
    tx: Sequencer,
    organizationId: string,
    series: InvoiceSeries = LEGACY_SERIES,
): Promise<string> {
    const where = {
        organizationId_series: { organizationId, series: series.key },
    };
    const row = await tx.invoiceSequence.upsert({
        where,
        create: { organizationId, series: series.key, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
        select: { lastNumber: true },
    });
    let number = series.format(row.lastNumber);
    for (let attempt = 0; attempt < CLASH_ATTEMPTS; attempt++) {
        if (!(await taken(tx, organizationId, number))) return number;
        const issued = await tx.invoice.findMany({
            where: { organizationId, number: { startsWith: series.stem } },
            select: { number: true },
        });
        const highest = Math.max(
            row.lastNumber,
            ...issued.map((i) => counterOf(i.number, series.stem)),
        );
        const moved = await tx.invoiceSequence.update({
            where,
            data: { lastNumber: highest + 1 },
            select: { lastNumber: true },
        });
        number = series.format(moved.lastNumber);
    }
    if (!(await taken(tx, organizationId, number))) return number;
    throw new BadRequestException({
        message:
            "Couldn't find a free invoice number in this format. Change the number format and try again.",
        details: { field: "invoiceNumberParts" },
    });
}

async function taken(
    tx: Sequencer,
    organizationId: string,
    number: string,
): Promise<boolean> {
    const found = await tx.invoice.findUnique({
        where: { organizationId_number: { organizationId, number } },
        select: { id: true },
    });
    return Boolean(found);
}

/** The counter a number carries after `stem`, or 0 when it is not one. */
function counterOf(number: string | null, stem: string): number {
    const rest = number?.slice(stem.length) ?? "";
    return /^\d+$/.test(rest) ? Number(rest) : 0;
}

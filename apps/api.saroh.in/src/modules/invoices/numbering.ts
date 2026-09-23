import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { DateTime } from "luxon";

type Sequencer = Pick<Prisma.TransactionClient, "invoiceSequence">;

export type InvoiceKind = "INVOICE" | "CREDIT_NOTE" | "SUPPLEMENTARY";

/** GST's limit on an invoice number (CGST Rules, rule 46). */
export const MAX_NUMBER_LENGTH = 16;

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
    format(n: number): string;
}

/**
 * The series every business had before ADR-008, and the one a business that
 * never chose a prefix stays in: its existing numbers carry on.
 */
export const LEGACY_SERIES: InvoiceSeries = {
    key: "INV",
    format: formatInvoiceNumber,
};

/**
 * Why a prefix is refused, or null. One to three capitals or digits, so the
 * longest number it makes — a registered credit note, "ABCCN/26-27/9999" —
 * stays within GST's 16 characters.
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
 * form a number carries: 23 September 2026 → "26-27". Read in the business's
 * own zone, so an invoice at ten past midnight on 1 April is next year's.
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

/**
 * The series a document is numbered in (ADR-008):
 *
 *  - registered: prefix + financial year — RC/26-27/0001; credit notes
 *    RCCN/26-27/0001;
 *  - unregistered: a plain prefix — PF-0001; credit notes PFCN-0001;
 *  - no prefix: the legacy INV series (INV-0001; INV/26-27/0001 once
 *    registered), credit notes INVCN.
 *
 * A supplementary invoice is an invoice and shares the invoices' series.
 */
export function seriesFor(input: {
    registered: boolean;
    prefix: string | null;
    kind: InvoiceKind;
    at: Date;
    timezone?: string | null;
}): InvoiceSeries {
    const base = input.prefix ?? LEGACY_SERIES.key;
    const head = input.kind === "CREDIT_NOTE" ? `${base}CN` : base;
    const pad = (n: number) => String(n).padStart(4, "0");
    const guard = (s: string) => {
        if (s.length > MAX_NUMBER_LENGTH) {
            throw new BadRequestException({
                message: `An invoice number can be at most ${MAX_NUMBER_LENGTH} characters, and this series has run past it. Choose a shorter prefix.`,
                details: { field: "invoicePrefix" },
            });
        }
        return s;
    };
    if (input.registered) {
        const key = `${head}/${financialYear(input.at, input.timezone ?? DEFAULT_TIMEZONE)}`;
        return { key, format: (n) => guard(`${key}/${pad(n)}`) };
    }
    if (head === LEGACY_SERIES.key) return LEGACY_SERIES;
    return { key: head, format: (n) => guard(`${head}-${pad(n)}`) };
}

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
 * Taken inside the caller's transaction on purpose: if anything after it
 * fails, the increment rolls back with it and no number is skipped.
 */
export async function nextInvoiceNumber(
    tx: Sequencer,
    organizationId: string,
    series: InvoiceSeries = LEGACY_SERIES,
): Promise<string> {
    const row = await tx.invoiceSequence.upsert({
        where: {
            organizationId_series: { organizationId, series: series.key },
        },
        create: { organizationId, series: series.key, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
        select: { lastNumber: true },
    });
    return series.format(row.lastNumber);
}

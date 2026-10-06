import { GST_PERCENT, gstPaise } from "@saroh/pricing-catalog";

import type { TaxType } from "../invoices/gst";
import { placeOfSupply, taxTypeFor } from "../invoices/gst";
import { stateCode } from "../invoices/gst-states";
import { DEFAULT_TIMEZONE, financialYear } from "../invoices/numbering";

/**
 * The pure rules of Saroh's own invoices (pricing catalogue U17): what each
 * line's GST is, how the tax splits, where the supply is, and how a number
 * reads. The service writes what these say; the specs pin them.
 *
 * Saroh's prices are before GST (KTD-18): each line's GST is worked out on
 * the line's amount after its discount, rounded half-up to the paisa once
 * (`gstPaise`, the same rule the provider plan's amount was made with), and
 * added to it. Within Saroh's state it splits CGST + SGST, the odd paisa to
 * CGST as the business's own invoices do (`invoices/gst.ts`); across
 * states it is IGST.
 */

/** What was charged: the checkout kinds, and a renewal. */
export const SAROH_INVOICE_SOURCES = [
    "NEW",
    "UPGRADE",
    "SCHEDULED",
    "RENEWAL",
] as const;
export type SarohInvoiceSource = (typeof SAROH_INVOICE_SOURCES)[number];

/** Saroh's GST rate on its plans, in basis points. */
export const SAROH_GST_RATE_BPS = GST_PERCENT * 100;

/** The zone Saroh's own financial year and paper dates are kept in. */
export const SAROH_TIMEZONE = DEFAULT_TIMEZONE;

export interface SarohLineInput {
    description: string;
    sac: string | null;
    quantity?: number;
    /** Before GST, per unit, in paise. */
    unitPaise: number;
    /** Off this line, before GST (a coupon, U16), in paise. */
    discountPaise?: number;
}

export interface SarohLine {
    description: string;
    sac: string | null;
    quantity: number;
    unitPaise: number;
    discountPaise: number;
    taxablePaise: number;
    gstRateBps: number;
    cgstPaise: number;
    sgstPaise: number;
    igstPaise: number;
    taxPaise: number;
    amountPaise: number;
}

export interface SarohTotals {
    subtotalPaise: number;
    discountPaise: number;
    taxablePaise: number;
    cgstPaise: number;
    sgstPaise: number;
    igstPaise: number;
    taxPaise: number;
    totalPaise: number;
}

const whole = (n: number | undefined): number =>
    typeof n === "number" && Number.isSafeInteger(n) && n > 0 ? n : 0;

/** One line's GST: on its amount after discount, rounded once, then split. */
export function taxSarohLine(
    input: SarohLineInput,
    taxType: TaxType,
): SarohLine {
    const quantity = Math.max(1, whole(input.quantity) || 1);
    const unitPaise = whole(input.unitPaise);
    const gross = quantity * unitPaise;
    const discountPaise = Math.min(gross, whole(input.discountPaise));
    const taxablePaise = gross - discountPaise;
    const taxPaise = gstPaise(taxablePaise);
    const sgst = taxType === "INTRA" ? Math.floor(taxPaise / 2) : 0;
    return {
        description: input.description,
        sac: input.sac,
        quantity,
        unitPaise,
        discountPaise,
        taxablePaise,
        gstRateBps: SAROH_GST_RATE_BPS,
        cgstPaise: taxType === "INTRA" ? taxPaise - sgst : 0,
        sgstPaise: sgst,
        igstPaise: taxType === "INTER" ? taxPaise : 0,
        taxPaise,
        amountPaise: taxablePaise + taxPaise,
    };
}

/** Every line taxed, and the invoice's sums from them (never re-rounded). */
export function taxSarohLines(
    inputs: readonly SarohLineInput[],
    taxType: TaxType,
): { lines: SarohLine[]; totals: SarohTotals } {
    const lines = inputs.map((l) => taxSarohLine(l, taxType));
    const sum = (pick: (l: SarohLine) => number) =>
        lines.reduce((s, l) => s + pick(l), 0);
    return {
        lines,
        totals: {
            subtotalPaise: sum((l) => l.quantity * l.unitPaise),
            discountPaise: sum((l) => l.discountPaise),
            taxablePaise: sum((l) => l.taxablePaise),
            cgstPaise: sum((l) => l.cgstPaise),
            sgstPaise: sum((l) => l.sgstPaise),
            igstPaise: sum((l) => l.igstPaise),
            taxPaise: sum((l) => l.taxPaise),
            totalPaise: sum((l) => l.amountPaise),
        },
    };
}

/**
 * Where the supply is, and so which GST: the state given at checkout, else
 * the state of the GSTIN given there or on the business's profile, else the
 * profile's state, else Saroh's own (a business that has told Saroh
 * nothing is taken to be local). Same state as Saroh → CGST + SGST.
 */
export function sarohSupply(input: {
    billToState: string | null;
    billToGstin: string | null;
    profileState: string | null;
    sellerState: string | null;
}): { placeOfSupply: string | null; taxType: TaxType } {
    const pos = placeOfSupply({
        billToState:
            stateCode(input.billToState) ??
            stateCode(input.billToGstin?.slice(0, 2)),
        deliveryState: input.profileState,
        businessState: input.sellerState,
    });
    return { placeOfSupply: pos, taxType: taxTypeFor(pos, input.sellerState) };
}

/** The series a number at `at` counts in: prefix and financial year. */
export function sarohSeries(prefix: string, at: Date): string {
    return `${prefix}/${financialYear(at, SAROH_TIMEZONE)}`;
}

/** SRH/26-27 and 1 → "SRH/26-27/00001"; the counter grows past five digits. */
export function sarohInvoiceNumber(series: string, n: number): string {
    return `${series}/${String(n).padStart(5, "0")}`;
}

/** Paise as the paper's rupees string: 12345 → "123.45". */
export function paiseToRupees(paise: number): string {
    const sign = paise < 0 ? "-" : "";
    const abs = Math.abs(Math.trunc(paise));
    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * The window of period ends that count as one period: half a cycle either
 * side. Razorpay sends `activated` and `charged` for the same payment; the
 * second names the same period end (or, when the first named none and one
 * was worked out, nearly the same) and must not be invoiced again. A real
 * renewal's end is a whole cycle on, outside it.
 */
export function samePeriodWindow(
    end: Date,
    cycle: string,
): { gte: Date; lte: Date } {
    const half =
        cycle === "year" ? 180 * 24 * 60 * 60 * 1000 : 14 * 24 * 60 * 60 * 1000;
    return {
        gte: new Date(end.getTime() - half),
        lte: new Date(end.getTime() + half),
    };
}

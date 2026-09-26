import { stateCode } from "./gst-states";

/**
 * GST on invoice lines (ADR-008) — pure, in integer paise, no I/O.
 *
 * Prices include GST. From a line's inclusive amount and its rate this
 * derives the taxable value and CGST + SGST (same state as the business) or
 * IGST (another state), rounded to the paisa per line, and the parts always
 * add back to the line. An order's discount is spread across its lines in
 * proportion before tax; delivery is a line of its own. Totals sum the
 * lines, so an order's invoice totals exactly what the order does.
 *
 * Rates are carried as basis points (18% = 1800) so no float touches them.
 */

/** The rates GST has, as the editor offers them. */
export const GST_RATES = [
    "0",
    "0.25",
    "3",
    "5",
    "12",
    "18",
    "28",
    "40",
] as const;

export type TaxType = "INTRA" | "INTER";

/** "18" / "18.00" / "0.25" → 1800 / 1800 / 25; null stays null. */
export function rateToBps(
    rate: string | { toString(): string } | null | undefined,
): number | null {
    if (rate === null || rate === undefined) return null;
    const [whole, frac = ""] = rate.toString().trim().split(".");
    return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

/** 1800 → "18", 25 → "0.25": how a rate is written back. */
export function bpsToRate(bps: number): string {
    const whole = Math.floor(bps / 100);
    const frac = bps % 100;
    return frac === 0
        ? String(whole)
        : `${whole}.${String(frac).padStart(2, "0").replace(/0$/, "")}`;
}

export function isGstRate(rate: string): boolean {
    if (!/^\d{1,2}(\.\d{1,2})?$/.test(rate.trim())) return false;
    const bps = rateToBps(rate);
    return GST_RATES.some((r) => rateToBps(r) === bps);
}

export interface GstSplit {
    taxableCents: number;
    cgstCents: number;
    sgstCents: number;
    igstCents: number;
    taxCents: number;
}

/**
 * One GST-inclusive amount → taxable value and tax. The taxable value is
 * rounded to the paisa and the tax is what is left, so nothing is lost; an
 * odd paisa of intra-state tax goes to CGST.
 */
export function splitInclusive(
    inclusiveCents: number,
    rateBps: number,
    taxType: TaxType,
): GstSplit {
    const taxableCents =
        rateBps <= 0
            ? inclusiveCents
            : Math.round((inclusiveCents * 10_000) / (10_000 + rateBps));
    const taxCents = inclusiveCents - taxableCents;
    if (taxType === "INTER") {
        return {
            taxableCents,
            cgstCents: 0,
            sgstCents: 0,
            igstCents: taxCents,
            taxCents,
        };
    }
    const sgstCents = Math.floor(taxCents / 2);
    return {
        taxableCents,
        cgstCents: taxCents - sgstCents,
        sgstCents,
        igstCents: 0,
        taxCents,
    };
}

/**
 * Share `amount` across `weights` in proportion, largest remainder first, so
 * the shares add up exactly. No share exceeds its weight: what cannot be
 * placed is dropped (a discount never takes a line below zero).
 */
export function allocate(weights: readonly number[], amount: number): number[] {
    const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
    const target = Math.min(Math.max(0, amount), total);
    if (target === 0 || total === 0) return weights.map(() => 0);
    const exact = weights.map((w) => (Math.max(0, w) * target) / total);
    const shares = exact.map(Math.floor);
    let left = target - shares.reduce((s, x) => s + x, 0);
    const order = exact
        .map((x, i) => ({ i, rest: x - Math.floor(x) }))
        .sort((a, b) => b.rest - a.rest || a.i - b.i);
    for (const { i } of order) {
        if (left === 0) break;
        if (shares[i] < Math.max(0, weights[i])) {
            shares[i] += 1;
            left -= 1;
        }
    }
    return shares;
}

/**
 * Where the supply is, as a GST state code: the bill-to state if set, else
 * where it is delivered, else the business's own state. A value that is not
 * a state falls to the next.
 */
export function placeOfSupply(input: {
    billToState?: string | null;
    deliveryState?: string | null;
    businessState: string | null;
}): string | null {
    return (
        stateCode(input.billToState) ??
        stateCode(input.deliveryState) ??
        stateCode(input.businessState)
    );
}

/** Same state as the business → CGST + SGST; another → IGST. */
export function taxTypeFor(
    placeOfSupplyCode: string | null,
    businessState: string | null,
): TaxType {
    return placeOfSupplyCode &&
        businessState &&
        placeOfSupplyCode !== businessState
        ? "INTER"
        : "INTRA";
}

export interface GstLineInput {
    description: string;
    quantity: number;
    /** GST-inclusive, per unit. */
    unitCents: number;
    rateBps: number | null;
    /** HSN or SAC. */
    code: string | null;
    /** False for delivery: an order discount comes off the items first. */
    discountable?: boolean;
    orderItemId?: string | null;
}

export interface GstLine extends GstLineInput {
    grossCents: number;
    discountCents: number;
    /** What the line comes to, inclusive of GST: gross less discount. */
    amountCents: number;
    /** Null on a receipt (unregistered business). */
    taxableCents: number | null;
    cgstCents: number;
    sgstCents: number;
    igstCents: number;
    taxCents: number;
}

export interface GstTotals {
    /** Sum of taxable values; on a receipt, sum of line amounts. */
    taxableCents: number;
    cgstCents: number;
    sgstCents: number;
    igstCents: number;
    taxCents: number;
    totalCents: number;
}

/**
 * Tax a set of lines: spread the discount (items first, then anything not
 * discountable), then derive each line's GST. An unregistered business gets
 * the same lines with no tax — a receipt.
 */
export function taxLines(
    lines: readonly GstLineInput[],
    opts: { registered: boolean; taxType: TaxType; discountCents?: number },
): { lines: GstLine[]; totals: GstTotals } {
    const gross = lines.map((l) => l.quantity * l.unitCents);
    const discountable = lines.map((l) => l.discountable !== false);
    const discount = Math.max(0, opts.discountCents ?? 0);

    const first = allocate(
        gross.map((g, i) => (discountable[i] ? g : 0)),
        discount,
    );
    const placed = first.reduce((s, x) => s + x, 0);
    const rest = allocate(
        gross.map((g, i) => (discountable[i] ? 0 : g)),
        discount - placed,
    );
    const discounts = first.map((x, i) => x + rest[i]);

    const out = lines.map((line, i): GstLine => {
        const amountCents = gross[i] - discounts[i];
        if (!opts.registered) {
            return {
                ...line,
                grossCents: gross[i],
                discountCents: discounts[i],
                amountCents,
                taxableCents: null,
                cgstCents: 0,
                sgstCents: 0,
                igstCents: 0,
                taxCents: 0,
            };
        }
        const split = splitInclusive(
            amountCents,
            line.rateBps ?? 0,
            opts.taxType,
        );
        return {
            ...line,
            grossCents: gross[i],
            discountCents: discounts[i],
            amountCents,
            ...split,
        };
    });

    const sum = (pick: (l: GstLine) => number) =>
        out.reduce((s, l) => s + pick(l), 0);
    const totalCents = sum((l) => l.amountCents);
    const taxCents = sum((l) => l.taxCents);
    return {
        lines: out,
        totals: {
            taxableCents: totalCents - taxCents,
            cgstCents: sum((l) => l.cgstCents),
            sgstCents: sum((l) => l.sgstCents),
            igstCents: sum((l) => l.igstCents),
            taxCents,
            totalCents,
        },
    };
}

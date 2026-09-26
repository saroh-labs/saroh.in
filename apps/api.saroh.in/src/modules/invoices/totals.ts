import { BadRequestException } from "@nestjs/common";

/**
 * Invoice arithmetic, in integer minor units (backend-data-and-money).
 *
 * Amounts arrive as strings with at most two decimals — the DTO refuses
 * anything else — so "12.5" is exactly 1250 and no float is ever summed.
 */

/** The largest amount a `Decimal(12, 2)` column holds, in minor units. */
export const MAX_CENTS = 999_999_999_999;

export function toCents(amount: string): number {
    const [whole, frac = ""] = amount.split(".");
    return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

export function fromCents(cents: number): string {
    const sign = cents < 0 ? "-" : "";
    const abs = Math.abs(cents);
    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export interface LineInput {
    description: string;
    quantity: number;
    unitPrice: string;
    /** GST in percent, on a registered business's invoice (ADR-008). */
    gstRate?: string | null;
    /** HSN or SAC. */
    hsnSac?: string | null;
}

export interface PricedLine extends LineInput {
    position: number;
    unitPrice: string;
    amount: string;
}

export interface Totals {
    lines: PricedLine[];
    subtotal: string;
    tax: string;
    total: string;
}

export function priceInvoice(lines: LineInput[], tax = "0"): Totals {
    if (lines.length === 0) {
        throw new BadRequestException({
            message: "An invoice needs at least one line",
            details: { field: "lines" },
        });
    }
    let subtotalCents = 0;
    const priced = lines.map((line, position) => {
        const amountCents = line.quantity * toCents(line.unitPrice);
        subtotalCents += amountCents;
        return {
            position,
            description: line.description,
            quantity: line.quantity,
            unitPrice: fromCents(toCents(line.unitPrice)),
            amount: fromCents(amountCents),
        };
    });
    const taxCents = toCents(tax);
    const totalCents = subtotalCents + taxCents;
    if (totalCents > MAX_CENTS) {
        throw new BadRequestException({
            message: "That total is larger than an invoice can hold",
            details: { field: "lines" },
        });
    }
    return {
        lines: priced,
        subtotal: fromCents(subtotalCents),
        tax: fromCents(taxCents),
        total: fromCents(totalCents),
    };
}

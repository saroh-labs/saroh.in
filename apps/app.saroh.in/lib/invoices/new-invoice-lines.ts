import type { GstPriceMode } from "@/lib/gst/price-mode";
import { effectiveMode, rateBps, unitPayCents } from "@/lib/gst/price-mode";

import { rateOption } from "./gst";
import type { InvoiceFormLine, InvoiceFormValues } from "./new-invoice";
import {
    centsOf,
    isGoodLine,
    isInterState,
    placeOf,
    priceOf,
} from "./new-invoice";

/**
 * New invoice (A), U14 #1126: its lines. A product picked as a line, and the
 * figures the live preview prints.
 *
 * The preview's sums mirror the API's (`invoices/gst.ts` `splitInclusive`:
 * a line typed on an invoice is charged as typed, GST included, rounded to
 * the paisa per line, an odd paisa of CGST + SGST to CGST). They are for
 * reading while typing only: the API prices the invoice, and issuing
 * freezes what it worked out.
 */

/* A product as a line ------------------------------------------------- */

/** What the picker lists: a product, or one of its variants. */
export interface PickableProduct {
    id: string;
    name: string;
    /** The price as the catalogue has it, in major units. */
    price: string;
    gstRate: string | null;
    gstPriceMode: GstPriceMode | null;
    hsnCode: string | null;
    variants: { id: string; title: string; price: string | null }[];
}

/** One row of the picker: a product, or a variant with its own name. */
export interface PickRow {
    key: string;
    name: string;
    price: string;
    gstRate: string | null;
    gstPriceMode: GstPriceMode | null;
    hsnCode: string | null;
}

/**
 * The picker's rows: a product with variants priced their own way lists
 * each variant ("Tee · Large"); one priced alike, or with none, is a row.
 */
export function pickRows(products: readonly PickableProduct[]): PickRow[] {
    return products.flatMap((p) => {
        const own = p.variants.filter((v) => v.price !== null);
        if (own.length === 0) {
            return [
                {
                    key: p.id,
                    name: p.name,
                    price: p.price,
                    gstRate: p.gstRate,
                    gstPriceMode: p.gstPriceMode,
                    hsnCode: p.hsnCode,
                },
            ];
        }
        return p.variants.map((v) => ({
            key: `${p.id}:${v.id}`,
            name: v.title ? `${p.name} · ${v.title}` : p.name,
            price: v.price ?? p.price,
            gstRate: p.gstRate,
            gstPriceMode: p.gstPriceMode,
            hsnCode: p.hsnCode,
        }));
    });
}

/**
 * A picked product as a line: its name, the price to pay for one (a line on
 * an invoice is charged as typed with GST included, so a product whose GST
 * is added on top comes in with it added, as an order would charge it), its
 * rate and its HSN. A business that isn't registered takes the price only.
 */
export function lineOfProduct(
    row: PickRow,
    terms: { registered: boolean; priceMode: GstPriceMode | null },
): InvoiceFormLine {
    const listCents = centsOf(row.price);
    const payCents = unitPayCents(
        listCents,
        row.gstRate,
        effectiveMode(terms.priceMode, row.gstPriceMode),
        terms.registered,
    );
    return {
        description: row.name.slice(0, 200),
        quantity: 1,
        unitPrice: priceOf(payCents),
        gstRate: terms.registered ? rateOption(row.gstRate) : "",
        hsnSac: terms.registered ? (row.hsnCode ?? "") : "",
    };
}

/* The preview's figures ----------------------------------------------- */

export interface PreviewLine {
    description: string;
    quantity: number;
    unitCents: number;
    amountCents: number;
    /** "18", "0"; null when no rate is chosen. */
    rate: string | null;
    hsn: string;
}

export interface PreviewSums {
    lines: PreviewLine[];
    /** Whether any line carries a rate: no GST rows otherwise (DEC-072). */
    taxed: boolean;
    inter: boolean;
    taxableCents: number;
    cgstCents: number;
    sgstCents: number;
    igstCents: number;
    totalCents: number;
    /** One rate across every rated line, for "CGST 9%"; null when mixed. */
    oneRate: string | null;
}

/** "18" → 1800, the API's way, as basis points. */
function bps(rate: string | null): number {
    return rateBps(rate) ?? 0;
}

/** One GST-inclusive amount → taxable value and tax (the API's split). */
export function splitInclusive(
    inclusiveCents: number,
    rateBpsValue: number,
    inter: boolean,
): { taxable: number; cgst: number; sgst: number; igst: number } {
    const taxable =
        rateBpsValue <= 0
            ? inclusiveCents
            : Math.round((inclusiveCents * 10_000) / (10_000 + rateBpsValue));
    const tax = inclusiveCents - taxable;
    if (inter) return { taxable, cgst: 0, sgst: 0, igst: tax };
    const sgst = Math.floor(tax / 2);
    return { taxable, cgst: tax - sgst, sgst, igst: 0 };
}

/**
 * The figures the preview prints, from the lines that count. A business
 * that isn't registered has a receipt: no tax, the lines as typed.
 */
export function previewSums(
    values: Pick<InvoiceFormValues, "lines" | "billToGstin" | "billToState">,
    ctx: { registered: boolean; businessState: string | null },
): PreviewSums {
    const lines: PreviewLine[] = values.lines.filter(isGoodLine).map((l) => {
        const unitCents = centsOf(l.unitPrice);
        return {
            description: l.description.trim(),
            quantity: Number(l.quantity),
            unitCents,
            amountCents: unitCents * Number(l.quantity),
            rate: ctx.registered && l.gstRate !== "" ? l.gstRate : null,
            hsn: ctx.registered ? l.hsnSac.replace(/\s+/g, "") : "",
        };
    });
    const inter = isInterState(
        placeOf(values, ctx.businessState),
        ctx.businessState,
    );
    const sums = {
        taxableCents: 0,
        cgstCents: 0,
        sgstCents: 0,
        igstCents: 0,
        totalCents: 0,
    };
    for (const l of lines) {
        const split = splitInclusive(l.amountCents, bps(l.rate), inter);
        sums.taxableCents += split.taxable;
        sums.cgstCents += split.cgst;
        sums.sgstCents += split.sgst;
        sums.igstCents += split.igst;
        sums.totalCents += l.amountCents;
    }
    const rated = lines.filter((l) => l.rate !== null);
    const rates = new Set(
        rated.filter((l) => bps(l.rate) > 0).map((l) => l.rate),
    );
    return {
        lines,
        taxed: rated.length > 0,
        inter,
        ...sums,
        oneRate: rates.size === 1 ? (Array.from(rates)[0] ?? null) : null,
    };
}

/** "Nil-rated", "GST 18%"; nothing for a line with no rate. */
export function lineRateWords(rate: string | null): string | null {
    if (rate === null) return null;
    return bps(rate) === 0 ? "Nil-rated" : `GST ${rate}%`;
}

/** Half a rate, as "9" or "2.5": what CGST and SGST each are. */
export function halfRate(rate: string): string {
    const half = bps(rate) / 2 / 100;
    return String(Number(half.toFixed(3)));
}

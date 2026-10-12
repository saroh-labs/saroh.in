import type { Prisma } from "@saroh/database";

import { bpsToRate, rateToBps } from "./gst";
import type { GstOnPrice, GstPriceMode, PriceTerms } from "./gst-price";
import { NO_GST_TERMS, sellUnit } from "./gst-price";
import { loadPriceTerms } from "./price-terms";
import type { LineInput } from "./totals";
import { fromCents } from "./totals";

/**
 * What a membership plan, a class pack or a course is charged (12 Oct
 * 2026): the typed price turned into the amount to pay by the one rule in
 * `gst-price.ts`, and the invoice line that bills it.
 *
 * Each of the three carries a GST rate, a SAC code and its own way of
 * carrying GST (null: the business's), as a service does. Every path that
 * sells or bills one reads its charge here, so the desk, the site, the
 * renewal job and the paper agree.
 *
 * **No rate, no change.** A plan, pack or course with no rate chosen is
 * charged exactly its typed price and its line carries no rate, as before
 * this existed: that is what keeps a renewal going out when nobody has
 * chosen a rate yet. The same goes for a business that is not registered.
 */

/** The GST columns of a plan, a class pack or a course. */
export interface RatedSale {
    gstRate?: string | { toString(): string } | null;
    sacCode?: string | null;
    /** Its own mode; null or absent is "same as the business". */
    gstPriceMode?: string | null;
}

/** The columns to select for a {@link RatedSale}. */
export const RATED_SALE_SELECT = {
    gstRate: true,
    sacCode: true,
    gstPriceMode: true,
} as const;

/** What an invoice line carries of a charge, beside its description. */
export type SaleLine = Pick<
    LineInput,
    "unitPrice" | "gstRate" | "hsnSac" | "priceMode"
>;

export interface SaleCharge {
    /** The price the business typed, in minor units. */
    listCents: number;
    /** The amount to pay. */
    payCents: number;
    /** The amount to pay as money: "2360.00". */
    pay: string;
    /** What it is charged under, or null when no GST is charged on it. */
    mode: GstPriceMode | null;
    /** The customer's GST words, or null when nothing is said. */
    gst: GstOnPrice | null;
    /**
     * The invoice line's price and tax columns. With no rate (or a business
     * that is not registered) it is the unit price alone, exactly the line
     * written before plans, packs and courses carried a rate.
     */
    line: SaleLine;
}

/** Whether a rate has been chosen: 0 is one ("Exempt"), null is not. */
export function hasRate(item: RatedSale | null | undefined): boolean {
    return item?.gstRate !== null && item?.gstRate !== undefined;
}

/**
 * A typed price sold today, under the item's own mode or the business's,
 * at the item's rate. Pure.
 */
export function saleCharge(
    listCents: number,
    item: RatedSale | null | undefined,
    terms: PriceTerms,
): SaleCharge {
    if (!terms.registered || !hasRate(item)) {
        return {
            listCents,
            payCents: listCents,
            pay: fromCents(listCents),
            mode: null,
            gst: null,
            line: { unitPrice: fromCents(listCents) },
        };
    }
    const unit = sellUnit(
        listCents,
        { gstRate: item?.gstRate, gstPriceMode: item?.gstPriceMode },
        terms,
    );
    const rateBps = rateToBps(item?.gstRate);
    return {
        listCents,
        payCents: unit.payCents,
        pay: fromCents(unit.payCents),
        mode: unit.mode,
        gst: unit.gst,
        line: {
            unitPrice: fromCents(unit.payCents),
            gstRate: rateBps === null ? null : bpsToRate(rateBps),
            hsnSac: item?.sacCode?.trim() ? item.sacCode.trim() : null,
            priceMode: unit.mode,
        },
    };
}

/**
 * The business's terms for a list of things on sale, read only when one of
 * them has a rate: with none there is nothing to say about GST, and
 * nothing is read.
 */
export async function priceTermsFor(
    db: Pick<Prisma.TransactionClient, "businessProfile">,
    organizationId: string,
    items: readonly RatedSale[],
): Promise<PriceTerms> {
    return items.some(hasRate)
        ? loadPriceTerms(db, organizationId)
        : NO_GST_TERMS;
}

/**
 * The charge for a typed price, reading the business's terms only when the
 * item has a rate: with none there is nothing to work out, and nothing is
 * read.
 */
export async function saleChargeInTx(
    db: Pick<Prisma.TransactionClient, "businessProfile">,
    organizationId: string,
    listCents: number,
    item: RatedSale | null | undefined,
): Promise<SaleCharge> {
    if (!hasRate(item)) return saleCharge(listCents, item, NO_GST_TERMS);
    return saleCharge(
        listCents,
        item,
        await loadPriceTerms(db, organizationId),
    );
}

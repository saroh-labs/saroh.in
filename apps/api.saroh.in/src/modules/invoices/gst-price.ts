import type { GstSplit, TaxType } from "./gst";
import { bpsToRate, rateToBps, splitInclusive } from "./gst";

/**
 * How a price carries GST (12 Oct 2026, amending ADR-008) — pure, in
 * integer paise, no I/O.
 *
 * A GST-registered business chooses whether the prices it types include GST
 * or have GST added to them, once for the business and, where it prices
 * something differently, on that service or product. This is the one place
 * that turns a typed price into the amount to pay.
 *
 * The rule, in three steps:
 *
 * 1. **One unit.** "Includes GST": the amount to pay is the typed price.
 *    "GST is added": it is the typed price plus its GST, rounded to the
 *    paisa, half up (₹1,000 at 18% is ₹1,000 + ₹180 = ₹1,180).
 * 2. **A line** is the quantity times that unit amount. Nothing else is
 *    rounded on the way, so "₹1,180 each" times 3 is exactly what is paid.
 * 3. **The tax in the line** is derived from that amount as every paper
 *    derives it (`splitInclusive`): the taxable value rounded to the paisa,
 *    the tax what is left, an odd paisa of intra-state tax to CGST.
 *
 * So the amount to pay is fixed when something is sold, and it is what an
 * order line (`OrderItem.price`) and a booking (`snapshot.service.priceCents`)
 * record. Everything after it — the invoice, a deposit, a credit note, a
 * refund, an edit — works from that amount and never asks for the mode
 * again; the line only remembers which it was (`gstPriceMode`) and what was
 * typed (`listPrice`), so a paper can say so.
 *
 * GST words apply only to a registered business's item with a rate above 0.
 * Not registered, no rate chosen, or exempt (0%): the amount to pay is the
 * typed price and nothing is said about GST.
 */

export const GST_PRICE_MODES = ["INCLUDED", "ADDED"] as const;
export type GstPriceMode = (typeof GST_PRICE_MODES)[number];

/** What every business and item means until someone chooses otherwise. */
export const DEFAULT_GST_PRICE_MODE: GstPriceMode = "INCLUDED";

export function isGstPriceMode(value: unknown): value is GstPriceMode {
    return (
        typeof value === "string" &&
        (GST_PRICE_MODES as readonly string[]).includes(value)
    );
}

/** A stored business mode as the maths reads it: anything else is INCLUDED. */
export function businessPriceMode(stored: unknown): GstPriceMode {
    return isGstPriceMode(stored) ? stored : DEFAULT_GST_PRICE_MODE;
}

/**
 * The business's GST standing for pricing: whether it is registered, and
 * how its prices carry GST unless an item says otherwise.
 */
export interface PriceTerms {
    registered: boolean;
    mode: GstPriceMode;
}

/**
 * The pricing terms of a tax profile already in hand (`loadTaxProfile`),
 * so a price and the paper for it are judged by the same read.
 */
export function priceTermsOf(profile: {
    registered: boolean;
    priceMode?: unknown;
}): PriceTerms {
    return {
        registered: profile.registered,
        mode: businessPriceMode(profile.priceMode),
    };
}

/** A business that charges no GST, or one from before the choice existed. */
export const NO_GST_TERMS: PriceTerms = {
    registered: false,
    mode: DEFAULT_GST_PRICE_MODE,
};

/**
 * The mode an item is priced under: its own when it has one, else the
 * business's. Null (or anything unknown) on the item is "same as the
 * business".
 */
export function effectivePriceMode(
    business: unknown,
    item: unknown,
): GstPriceMode {
    return isGstPriceMode(item) ? item : businessPriceMode(business);
}

export interface PriceInput {
    /** The price the business typed, per unit. */
    listCents: number;
    /** Basis points (18% = 1800); null when no rate was chosen. */
    rateBps: number | null;
    mode: GstPriceMode;
    /** Defaults to 1. */
    quantity?: number;
    /** False: the business charges no GST, whatever the rate says. */
    registered?: boolean;
    /** Defaults to INTRA (CGST + SGST). */
    taxType?: TaxType;
}

export interface PricedCharge extends GstSplit {
    /**
     * How the price carries GST, or null when no GST is charged on it (not
     * registered, no rate, or 0%) and so nothing is said about GST.
     */
    mode: GstPriceMode | null;
    rateBps: number | null;
    quantity: number;
    /** The typed price, per unit. */
    listCents: number;
    /** The GST in (INCLUDED) or on (ADDED) one unit. */
    unitGstCents: number;
    /** The amount to pay for one unit. */
    unitPayCents: number;
    /** The amount to pay for the line: quantity × `unitPayCents`. */
    payCents: number;
}

/** Whether GST is charged at all: registered, with a rate above 0. */
function charges(registered: boolean, rateBps: number | null): boolean {
    return registered && rateBps !== null && rateBps > 0;
}

/**
 * The amount to pay for one unit of a typed price. ADDED rounds the GST to
 * the paisa, half up; everything else pays the typed price.
 */
export function unitPayCents(
    listCents: number,
    rateBps: number | null,
    mode: GstPriceMode,
    registered = true,
): number {
    if (mode !== "ADDED" || !charges(registered, rateBps)) return listCents;
    return listCents + Math.round((listCents * (rateBps ?? 0)) / 10_000);
}

/**
 * A typed price, a rate, a mode and a quantity → the taxable value, the tax
 * split and the amount to pay. The rule is the three steps at the top of
 * this file.
 */
export function priceCharge(input: PriceInput): PricedCharge {
    const quantity = input.quantity ?? 1;
    const registered = input.registered ?? true;
    const taxed = charges(registered, input.rateBps);
    const unitPay = unitPayCents(
        input.listCents,
        input.rateBps,
        input.mode,
        registered,
    );
    const payCents = quantity * unitPay;
    const rate = taxed ? (input.rateBps ?? 0) : 0;
    const unit = splitInclusive(unitPay, rate, "INTER");
    const split = splitInclusive(payCents, rate, input.taxType ?? "INTRA");
    return {
        mode: taxed ? input.mode : null,
        rateBps: input.rateBps,
        quantity,
        listCents: input.listCents,
        unitGstCents: unit.taxCents,
        unitPayCents: unitPay,
        payCents,
        ...split,
    };
}

/**
 * What a customer is told about the GST on a price, as the API serves it:
 * the site only formats it (`gstPriceWords` in `@saroh/site-blocks`), and
 * never works any of it out. Null when nothing is said about GST.
 */
export interface GstOnPrice {
    mode: GstPriceMode;
    /** The rate as it is written: "18", "0.25". */
    rate: string;
    /** The typed price, the GST in or on it, and the amount to pay. */
    listCents: number;
    gstCents: number;
    payCents: number;
}

/** The customer's GST words for one unit of a typed price, or null. */
export function gstOnPrice(
    input: Omit<PriceInput, "quantity" | "taxType">,
): GstOnPrice | null {
    const charge = priceCharge({ ...input, quantity: 1 });
    if (charge.mode === null || charge.rateBps === null) return null;
    return {
        mode: charge.mode,
        rate: bpsToRate(charge.rateBps),
        listCents: charge.listCents,
        gstCents: charge.unitGstCents,
        payCents: charge.unitPayCents,
    };
}

/** The columns of a product or service its price is worked out from. */
export interface PricedItem {
    gstRate: string | { toString(): string } | null | undefined;
    /** The item's own mode; null or absent is "same as the business". */
    gstPriceMode?: string | null;
}

/** One unit of something as it is sold today. */
export interface SoldUnit {
    /** The price the business typed. */
    listCents: number;
    /** The amount to pay for one: what the order line records as its price. */
    payCents: number;
    /**
     * What it is charged under, or null when no GST is charged on it. The
     * line records it (`OrderItem.gstPriceMode`) with `listCents`.
     */
    mode: GstPriceMode | null;
    /** The customer's GST words, or null when nothing is said. */
    gst: GstOnPrice | null;
}

/**
 * A typed price sold today: under the item's own mode or the business's,
 * at the item's rate. The one way a product's or a variant's price becomes
 * an order line's.
 */
export function sellUnit(
    listCents: number,
    item: PricedItem,
    terms: PriceTerms,
): SoldUnit {
    const input = {
        listCents,
        rateBps: rateToBps(item.gstRate),
        mode: effectivePriceMode(terms.mode, item.gstPriceMode),
        registered: terms.registered,
    };
    const charge = priceCharge(input);
    return {
        listCents,
        payCents: charge.unitPayCents,
        mode: charge.mode,
        gst: gstOnPrice(input),
    };
}

/**
 * What an order line stores of how it was sold, beside its `price` (the
 * amount to pay): nothing when no GST was charged, so a line of a business
 * that charges none reads exactly as it always has.
 */
export function soldColumns(unit: Pick<SoldUnit, "listCents" | "mode">): {
    gstPriceMode: GstPriceMode | null;
    listPrice: string | null;
} {
    if (unit.mode === null) return { gstPriceMode: null, listPrice: null };
    const abs = Math.abs(unit.listCents);
    return {
        gstPriceMode: unit.mode,
        listPrice: `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`,
    };
}

/**
 * The same words for an amount already charged (a booking's price, a
 * deposit, an order line): the amount to pay is known, and the GST is what
 * is inside it at the rate. `mode` is what it was charged under; "ADDED"
 * reads the amount back as a price plus GST.
 */
export function gstInsidePaid(input: {
    payCents: number;
    rateBps: number | null;
    mode: GstPriceMode | null | undefined;
    registered?: boolean;
}): GstOnPrice | null {
    if (!charges(input.registered ?? true, input.rateBps)) return null;
    const rateBps = input.rateBps ?? 0;
    const split = splitInclusive(input.payCents, rateBps, "INTER");
    const mode = input.mode === "ADDED" ? "ADDED" : "INCLUDED";
    return {
        mode,
        rate: bpsToRate(rateBps),
        listCents: mode === "ADDED" ? split.taxableCents : input.payCents,
        gstCents: split.taxCents,
        payCents: input.payCents,
    };
}

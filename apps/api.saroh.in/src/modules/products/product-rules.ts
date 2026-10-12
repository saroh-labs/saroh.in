import { BadRequestException } from "@nestjs/common";

import { moneyWordsMinor } from "../../common/words-format";
import type { PricedItem, PriceTerms } from "../invoices/gst-price";
import { sellUnit } from "../invoices/gst-price";
import { SHOP_FIELDS } from "./dto";

/**
 * The product's own rules, pure so the unit project can pin them without a
 * database. Money arrives as the DTO-checked decimal string ("799", "24.50")
 * and is compared in integer minor units — never as a float.
 */

export function moneyToCents(amount: string): number {
    const [whole, frac = ""] = amount.split(".");
    return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

/** What a price is compared with its MRP under. */
export interface MrpGst {
    /** The product's own rate and its own "GST on this price", if any. */
    item: PricedItem;
    /** The business's standing (`loadPriceTerms`). */
    terms: PriceTerms;
    /** For the sums in the message. */
    currency: string;
    /**
     * The option the sum is about ("Large"), named in the message when the
     * write is the product's and the trouble is one of its options.
     */
    option?: string | null;
}

/** A price whose amount to pay is above its MRP. */
export interface OverMrp {
    /** The option it is about; null for the product's own price. */
    option: string | null;
    /** The typed price. */
    listCents: number;
    /** The amount to pay for one, GST and all (`invoices/gst-price.ts`). */
    payCents: number;
    mrpCents: number;
    /** The rate GST is added at ("18"); null where none is added. */
    addedRate: string | null;
}

/**
 * GST is part of MRP (the owner, 12 Oct 2026): an MRP includes all taxes, so
 * it is compared with the amount the customer pays for one, GST and all,
 * never with the typed price before GST. Where the price includes GST, or
 * none is charged, the amount to pay is the typed price and this is the
 * comparison it always was.
 *
 * Null when the amount to pay is at or under the MRP, or there is no MRP.
 * Equal is allowed: a product sold at MRP.
 */
export function overMrp(
    price: string,
    mrp: string | null,
    gst?: Pick<MrpGst, "item" | "terms" | "option">,
): OverMrp | null {
    if (mrp === null) return null;
    const listCents = moneyToCents(price);
    const mrpCents = moneyToCents(mrp);
    const unit = gst ? sellUnit(listCents, gst.item, gst.terms) : null;
    const payCents = unit ? unit.payCents : listCents;
    if (payCents <= mrpCents) return null;
    return {
        option: gst?.option ?? null,
        listCents,
        payCents,
        mrpCents,
        addedRate: unit?.gst?.mode === "ADDED" ? unit.gst.rate : null,
    };
}

/** What a price above its MRP has always been told. */
export const MRP_BELOW_PRICE =
    "MRP can't be lower than the price it sells for.";

/**
 * Why it is refused. A typed price that is itself above the MRP says what
 * it always said; one that only the GST added takes over says so with the
 * sums, and names the three ways out.
 */
export function overMrpMessage(over: OverMrp, currency: string): string {
    const pay = moneyWordsMinor(over.payCents, currency);
    const mrp = moneyWordsMinor(over.mrpCents, currency);
    if (over.addedRate !== null && over.listCents <= over.mrpCents) {
        const sum = `${over.addedRate}% GST added this is ${pay} to pay, more than its MRP of ${mrp}. Lower the price, raise the MRP, or set this product's price to include GST.`;
        return over.option ? `${over.option}: with ${sum}` : `With ${sum}`;
    }
    if (over.option) {
        return `${over.option} is ${pay} to pay, more than its MRP of ${mrp}. Lower its price or raise the MRP.`;
    }
    return MRP_BELOW_PRICE;
}

/**
 * An MRP is the printed price customers compare against, so it can never be
 * below what the customer pays for the product. Equal is allowed: a product
 * sold at MRP. With `gst`, what the customer pays is the amount to pay under
 * the product's GST ({@link overMrp}); without it, the typed price.
 */
export function assertMrpAtOrAbovePrice(
    price: string,
    mrp: string | null,
    field = "mrp",
    gst?: MrpGst,
): void {
    const over = overMrp(price, mrp, gst);
    if (!over) return;
    throw new BadRequestException({
        message: overMrpMessage(over, gst?.currency ?? "INR"),
        field,
    });
}

/** A product's price, MRP and GST, with its options', as they will stand. */
export interface MrpJudged {
    price: string;
    mrp: string | null;
    gstRate: PricedItem["gstRate"];
    gstPriceMode?: string | null;
    /** Each option: its own price and MRP, null where it is the product's. */
    variants?: readonly {
        title: string;
        price: string | null;
        mrp: string | null;
    }[];
}

/**
 * Everything of a product whose amount to pay is above its MRP: the
 * product's own price first, then each option that has a price or an MRP of
 * its own (one with neither sells as the product does, and is the product's
 * finding). An option's MRP is its own, else the product's.
 *
 * `gstOnly` keeps only what GST added takes over the MRP.
 */
export function productOverMrp(
    product: MrpJudged,
    terms: PriceTerms,
    gstOnly = false,
): OverMrp[] {
    const item = {
        gstRate: product.gstRate,
        gstPriceMode: product.gstPriceMode,
    };
    const found: OverMrp[] = [];
    const own = overMrp(product.price, product.mrp, { item, terms });
    if (own) found.push(own);
    for (const v of product.variants ?? []) {
        if (v.price === null && v.mrp === null) continue;
        const over = overMrp(v.price ?? product.price, v.mrp ?? product.mrp, {
            item,
            terms,
            option: v.title,
        });
        if (over) found.push(over);
    }
    return gstOnly ? found.filter((o) => o.payCents > o.listCents) : found;
}

/**
 * What a product's own write is refused for: its own price above its MRP,
 * else the first option GST added takes above its MRP. Null: it may be
 * saved.
 */
export function firstOverMrp(
    product: MrpJudged,
    terms: PriceTerms,
): OverMrp | null {
    const found = productOverMrp(product, terms);
    return (
        found.find((o) => o.option === null) ??
        found.find((o) => o.payCents > o.listCents) ??
        null
    );
}

/** Whether a product or any of its options has an MRP to be over. */
export function hasMrp(product: Pick<MrpJudged, "mrp" | "variants">): boolean {
    return (
        product.mrp !== null ||
        (product.variants ?? []).some((v) => v.mrp !== null)
    );
}

/**
 * Refuse a product's own write that leaves the product, or one of its
 * options once GST is added, above its MRP. The product's own price is
 * judged whichever way it carries GST; an option is named, and judged here
 * only for what GST added does to it (an option's typed price against its
 * MRP is its own form's rule, `VariantsService`).
 */
export function assertProductWithinMrp(
    product: MrpJudged,
    terms: PriceTerms,
    currency: string,
    field: string,
): void {
    const over = firstOverMrp(product, terms);
    if (!over) return;
    throw new BadRequestException({
        message: overMrpMessage(over, currency),
        field,
    });
}

/**
 * The saving against the MRP that is true: the MRP beside the amount to pay
 * for one, GST and all, in minor units. Whole percent, rounded DOWN so the
 * shop never claims more off than there is. Null when there is no MRP or
 * nothing is saved (the amount to pay is the MRP, or above it).
 */
export function mrpSaving(
    payCents: number,
    mrp: string | null,
): { mrp: string; percent: number } | null {
    if (mrp === null) return null;
    const mrpCents = moneyToCents(mrp);
    if (mrpCents <= payCents || mrpCents === 0) return null;
    return {
        mrp: `${Math.floor(mrpCents / 100)}.${String(mrpCents % 100).padStart(2, "0")}`,
        percent: Math.floor(((mrpCents - payCents) * 100) / mrpCents),
    };
}

/**
 * The switches a merchant flips per field. Only known keys, only booleans:
 * a typo can never create a field, and a non-boolean can never be read as
 * "shown". Returns the cleaned object to store.
 */
export function cleanShopFields(
    input: Record<string, unknown>,
): Record<string, boolean> {
    const known = new Set<string>(SHOP_FIELDS);
    const out: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(input)) {
        if (!known.has(key)) {
            throw new BadRequestException({
                message: `Unknown shop field "${key}"`,
                field: "shopFields",
            });
        }
        if (typeof value !== "boolean") {
            throw new BadRequestException({
                message: `"${key}" must be on or off`,
                field: "shopFields",
            });
        }
        out[key] = value;
    }
    return out;
}

export interface DetailsState {
    madeHere: boolean;
    maker: string | null;
    returnsMode: string;
    returnsText: string | null;
}

/**
 * The Made by and Returns choices have to be answerable once saved: someone
 * else made it → say who; its own returns rule → write it. Checked on the
 * state AFTER the patch, so a save that only flips the mode is judged against
 * the text already stored.
 */
export function assertDetailsCoherent(state: DetailsState): void {
    if (!state.madeHere && !state.maker) {
        throw new BadRequestException({
            message: "Add who makes it, or switch back to Made here.",
            field: "maker",
        });
    }
    if (state.returnsMode === "OWN" && !state.returnsText) {
        throw new BadRequestException({
            message:
                "Write this product's returns rule, or use the location's.",
            field: "returnsText",
        });
    }
}

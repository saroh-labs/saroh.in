import { formatMoneyMajor } from "@/lib/format/money";

import type { GstPriceMode } from "./price-mode";
import {
    effectiveMode,
    isGstPriceMode,
    rateBps,
    unitPayCents,
} from "./price-mode";

/**
 * GST is part of MRP (the owner, 12 Oct 2026), as the product editor says
 * it. Pure and client-safe.
 *
 * An MRP includes all taxes, so it is compared with the amount the customer
 * pays for one, GST and all, never with a typed price GST is still to be
 * added to. For a GST-registered business whose price has GST added (its
 * own way, or this product's own), the editor shows that amount beside the
 * MRP and says so before Save when it is above the MRP.
 *
 * The rule itself is the API's (`products/product-rules.ts` there, on
 * `invoices/gst-price.ts`): this is the preview mirror in `price-mode.ts`,
 * for a form that hasn't saved yet, and the API's refusal is the truth.
 * Nothing changes for a business that isn't registered, or while a price
 * includes GST: the amount to pay is the typed price.
 */

/** How one product's price carries GST, as its editor knows it. */
export interface MrpPricing {
    /** Known to be GST-registered. False: no GST words, the typed price. */
    registered: boolean;
    /** The business's way; null when it couldn't be told. */
    businessMode: GstPriceMode | null;
    /** The product's own choice: "" (or anything else) is the business's. */
    itemMode: string;
    /** The product's rate in percent: "18"; "" when none is chosen. */
    rate: string;
}

/** Nothing said about GST: the typed price is the amount to pay. */
export const NO_MRP_PRICING: MrpPricing = {
    registered: false,
    businessMode: null,
    itemMode: "",
    rate: "",
};

/** "24.50" as 2450: whole paise, never a float sum. Null when not money. */
export function minorOf(amount: string): number | null {
    const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(amount.trim());
    if (!match) return null;
    const [, whole = "0", frac = ""] = match;
    return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

/** The rate as it is written in a sentence: "18", "0.25". */
function rateWords(bps: number): string {
    return String(bps / 100);
}

/** One unit's typed price and what is paid for it. */
export interface PayPreview {
    listCents: number;
    payCents: number;
    /** The rate GST is added at ("18"); null where none is added. */
    addedRate: string | null;
}

/**
 * What one unit of `price` costs to pay under `pricing`. GST is added only
 * for a registered business, under "GST is added" (the product's own
 * choice, else the business's), at a rate above 0. Where the business's
 * way couldn't be told and the product has no choice of its own, nothing
 * is added here: the API decides. Null when `price` isn't money.
 */
export function payPreview(
    price: string,
    pricing: MrpPricing,
): PayPreview | null {
    const listCents = minorOf(price);
    if (listCents === null) return null;
    const known =
        pricing.businessMode !== null || isGstPriceMode(pricing.itemMode);
    const mode = effectiveMode(pricing.businessMode, pricing.itemMode);
    const bps = rateBps(pricing.rate);
    const added =
        pricing.registered &&
        known &&
        mode === "ADDED" &&
        bps !== null &&
        bps > 0;
    return {
        listCents,
        payCents: added
            ? unitPayCents(listCents, pricing.rate, "ADDED", true)
            : listCents,
        addedRate: added ? rateWords(bps) : null,
    };
}

const money = (cents: number, currency: string) =>
    formatMoneyMajor((cents / 100).toFixed(2), currency);

/**
 * The quiet line beside the MRP: "₹1,180 to pay with 18% GST". Null when
 * no GST is added to the price, so nothing is said.
 */
export function toPayLine(
    price: string,
    pricing: MrpPricing,
    currency: string,
): string | null {
    const pay = payPreview(price, pricing);
    if (!pay?.addedRate || pay.listCents === 0) return null;
    return `${money(pay.payCents, currency)} to pay with ${pay.addedRate}% GST`;
}

/**
 * Why a variant's own price is over its MRP, said beside the price in the
 * Variants list, or null when it isn't: the amount to pay for one against
 * `cap`, the variant's own MRP or the product's. A blank price is the
 * product's own and is Basics' to judge, and so is a missing MRP.
 */
export function optionOverMrpNote(
    price: string,
    cap: string | null | undefined,
    pricing: MrpPricing,
    currency: string,
): string | null {
    if (!price.trim() || !cap) return null;
    const pay = payPreview(price, pricing);
    const capCents = minorOf(cap);
    if (!pay || capCents === null || pay.payCents <= capCents) return null;
    const mrp = money(capCents, currency);
    return pay.addedRate !== null && pay.listCents <= capCents
        ? `With ${pay.addedRate}% GST added this is ${money(pay.payCents, currency)} to pay, above the MRP of ${mrp}. Lower it, or raise the MRP in Basics.`
        : `Above the MRP of ${mrp}. Lower it, or raise the MRP in Basics.`;
}

/** What a typed price above its MRP has always been told. */
export const MRP_BELOW_PRICE =
    "MRP can't be lower than the price it sells for.";

/**
 * Why a price can't be saved with this MRP, in the API's own words, or
 * null when it can: the amount to pay is at or under the MRP. A typed
 * price that is itself above the MRP says what it always said; one that
 * only the GST added takes over says so with the sums.
 */
export function overMrpProblem(
    price: string,
    mrp: string,
    pricing: MrpPricing,
    currency: string,
): string | null {
    const pay = payPreview(price, pricing);
    const mrpCents = minorOf(mrp);
    if (!pay || mrpCents === null || pay.payCents <= mrpCents) return null;
    if (pay.addedRate === null || pay.listCents > mrpCents) {
        return MRP_BELOW_PRICE;
    }
    return `With ${pay.addedRate}% GST added this is ${money(pay.payCents, currency)} to pay, more than its MRP of ${money(mrpCents, currency)}. Lower the price, raise the MRP, or set this product's price to include GST.`;
}

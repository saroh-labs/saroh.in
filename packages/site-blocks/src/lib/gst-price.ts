import { siteMoney } from "./money";

/**
 * The GST words beside a price a customer is about to pay, one way on every
 * page: the product page, the bag and checkout, the booking page, the pay
 * page and the confirmation.
 *
 * The numbers come from the API (`invoices/gst-price.ts` there): the price
 * the business typed, the GST in or on it, and the amount to pay. Nothing
 * here adds, multiplies or rounds a price; it only writes the sentence.
 * A plain module, not a client one, so a server page can call it.
 *
 * The business chooses how its prices carry GST, so there are two forms:
 *
 * - includes GST: "₹1,000, includes ₹152.54 GST (18%)"
 * - GST is added: "₹1,000 + ₹180 GST (18%)", and ₹1,180 to pay
 *
 * A price with no GST on it (the business isn't registered, or the item is
 * exempt) has no `GstOnPrice` at all, and nothing is said.
 */
export interface GstOnPrice {
    mode: "INCLUDED" | "ADDED";
    /** The rate as it is written: "18", "0.25". */
    rate: string;
    /** The typed price, the GST in or on it, and the amount to pay, × 100. */
    listCents: number;
    gstCents: number;
    payCents: number;
}

/** Narrows an API answer: anything else is "nothing said about GST". */
export function isGstOnPrice(value: unknown): value is GstOnPrice {
    if (typeof value !== "object" || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
        (v.mode === "INCLUDED" || v.mode === "ADDED") &&
        typeof v.rate === "string" &&
        typeof v.listCents === "number" &&
        typeof v.gstCents === "number" &&
        typeof v.payCents === "number"
    );
}

/** The answer as the blocks hold it: the words' numbers, or null. */
export function gstOnPriceOf(value: unknown): GstOnPrice | null {
    return isGstOnPrice(value) ? value : null;
}

function money(cents: number, currency: string, locale: string): string {
    return siteMoney(cents / 100, currency, locale) ?? (cents / 100).toFixed(2);
}

/**
 * The whole sentence, price first: "₹1,000, includes ₹152.54 GST (18%)" or
 * "₹1,000 + ₹180 GST (18%)". For a line that shows no price of its own.
 */
export function gstPriceWords(
    gst: GstOnPrice,
    currency: string,
    locale = "en-IN",
): string {
    const price = money(gst.listCents, currency, locale);
    return `${price}${gst.mode === "ADDED" ? " " : ", "}${gstNoteWords(gst, currency, locale)}`;
}

/**
 * The part after a price that is already on the page: "includes ₹152.54
 * GST (18%)" under a price that includes it, "+ ₹180 GST (18%)" beside one
 * it is added to.
 */
export function gstNoteWords(
    gst: GstOnPrice,
    currency: string,
    locale = "en-IN",
): string {
    const tax = money(gst.gstCents, currency, locale);
    return gst.mode === "ADDED"
        ? `+ ${tax} GST (${gst.rate}%)`
        : `includes ${tax} GST (${gst.rate}%)`;
}

/** The amount to pay, as money: "₹1,180". */
export function gstPayWords(
    gst: GstOnPrice,
    currency: string,
    locale = "en-IN",
): string {
    return money(gst.payCents, currency, locale);
}

/**
 * A price that is only being browsed (a product card, a services list): the
 * price the business typed, with "+ GST" after it when GST comes on top, so
 * the amount to pay is never a surprise. `price` is already formatted.
 */
export function browsePriceWords(price: string, gstAdded: boolean): string {
    return gstAdded ? `${price} + GST` : price;
}

/**
 * Under a line whose amount is already the amount to pay (a bag line, an
 * order's line, an invoice's): "includes ₹152.54 GST (18%)" where the price
 * has it in, and the whole sum, "₹1,000 + ₹180 GST (18%)", where it was
 * added, so the amount beside it is explained.
 */
export function gstLineWords(
    gst: GstOnPrice,
    currency: string,
    locale = "en-IN",
): string {
    return gst.mode === "ADDED"
        ? gstPriceWords(gst, currency, locale)
        : gstNoteWords(gst, currency, locale);
}

/**
 * The same words where they start a line of their own: "Includes ₹152.54
 * GST (18%)". ("+ ₹180 GST (18%)" has no letter to raise.)
 */
export function startOfLine(words: string): string {
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The amount to pay beside a Join, Buy or Pay button, where the page has
 * already written the typed price as money: the API's amount to pay when
 * GST is added, else that price as it stands (it is the amount to pay).
 * `value` is the API's answer, narrowed here: anything strange is none.
 */
export function payPriceWords(
    price: string,
    value: unknown,
    currency: string,
    locale = "en-IN",
): string {
    const gst = gstOnPriceOf(value);
    return gst?.mode === "ADDED" ? gstPayWords(gst, currency, locale) : price;
}

/**
 * The line of its own under an amount to pay: "Includes ₹305.08 GST (18%)"
 * or "₹2,000 + ₹360 GST (18%)". Null when the API said nothing about GST.
 */
export function gstUnderWords(
    value: unknown,
    currency: string,
    locale = "en-IN",
): string | null {
    const gst = gstOnPriceOf(value);
    return gst ? startOfLine(gstLineWords(gst, currency, locale)) : null;
}

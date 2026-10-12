import { addedGstWords, typedCents } from "./item-words";
import { unitPayCents } from "./price-mode";

/**
 * Which price a figure is, and how a price the business set says its GST
 * (12 Oct 2026). Pure and client-safe.
 *
 * One rule for every money figure in the app
 * (`docs/patterns/backend-data-and-money.md` → One figure, one kind):
 *
 * 1. Money taken, owed or expected (what a member pays each period,
 *    "a month from members", takings, a renewal, a to-pay amount) is the
 *    amount the customer pays, GST and all: {@link payOf}.
 * 2. A price the business set, read as its own price list, is the typed
 *    price, and where GST is added on top it says so right beside it:
 *    {@link setPriceWords} ("₹2,000 + GST"), or the whole sum where there
 *    is room, {@link addedSum} ("₹2,000 + ₹360 GST (18%) = ₹2,360 to pay").
 * 3. Two figures compared are the same kind: both amounts to pay.
 *
 * The numbers are the API's (`GstOnPrice`, from `invoices/gst-price.ts`
 * there): nothing here adds, multiplies or rounds a price. Where the API
 * says nothing about GST (the business isn't registered, no rate, exempt,
 * or an older API) the typed price is the amount to pay and every helper
 * here answers exactly what the page showed before.
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
export function gstOnPriceOf(value: unknown): GstOnPrice | null {
    if (typeof value !== "object" || value === null) return null;
    const v = value as Record<string, unknown>;
    return (v.mode === "INCLUDED" || v.mode === "ADDED") &&
        typeof v.rate === "string" &&
        typeof v.listCents === "number" &&
        typeof v.gstCents === "number" &&
        typeof v.payCents === "number"
        ? (value as GstOnPrice)
        : null;
}

/** Whether GST comes on top of the typed price. */
export function gstIsAdded(gst: unknown): boolean {
    return gstOnPriceOf(gst)?.mode === "ADDED";
}

/** Minor units as the wire's decimal string: 236000 → "2360.00". */
function majorString(cents: number): string {
    const abs = Math.abs(cents);
    return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * The amount to pay for a typed price ("2360.00" for "2000.00" with 18%
 * added), from the API's own sum; the typed price where GST is inside it
 * or nothing is said.
 */
export function payOf(price: string, gst: unknown): string {
    const on = gstOnPriceOf(gst);
    return on?.mode === "ADDED" ? majorString(on.payCents) : price;
}

/**
 * What a typed price comes to to pay under this GST, in minor units. The
 * price the API summed is answered with its own sum; another price of the
 * same thing (an older one in its history) by the preview mirror, at the
 * same rate.
 */
export function payCentsFor(listCents: number, gst: unknown): number {
    const on = gstOnPriceOf(gst);
    if (on?.mode !== "ADDED") return listCents;
    if (listCents === on.listCents) return on.payCents;
    return unitPayCents(listCents, on.rate, "ADDED", true);
}

/**
 * Whether an amount someone paid is what a price the business set comes
 * to: the price itself (GST inside it, or none charged, as every sale was
 * before GST could be added) or the price with its GST on top. So a sale
 * is never called "an older price" only because GST is added to it.
 */
export function paidAtPrice(
    paid: string | null | undefined,
    price: string | null | undefined,
    gst: unknown,
): boolean {
    const paidCents = typedCents(paid);
    const listCents = typedCents(price);
    if (paidCents === null || listCents === null) return false;
    return paidCents === listCents || paidCents === payCentsFor(listCents, gst);
}

/**
 * A price the business set, already written as money, with "+ GST" after
 * it when GST comes on top: "₹2,000 + GST", "₹2,000 / month + GST". The
 * words the site's price lists use (`browsePriceWords`).
 */
export function setPriceWords(price: string, gst: unknown): string {
    return gstIsAdded(gst) ? `${price} + GST` : price;
}

/**
 * The whole sum beside a price GST is added to, where there is room:
 * "₹2,000 + ₹360 GST (18%) = ₹2,360 to pay", the form the desk dialogs
 * use (`addedGstWords`). Null whenever the typed price is the amount to
 * pay.
 */
export function addedSum(
    gst: unknown,
    currency: string | null | undefined,
): string | null {
    const on = gstOnPriceOf(gst);
    return on?.mode === "ADDED" ? addedGstWords(on, currency) : null;
}

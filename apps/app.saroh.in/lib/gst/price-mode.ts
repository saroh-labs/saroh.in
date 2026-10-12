/**
 * How a price carries GST (12 Oct 2026), as the app says and previews it.
 * Pure and client-safe.
 *
 * A GST-registered business chooses whether the prices it types include
 * GST or have GST added to them: once in Settings › Business › Tax and
 * invoices, and on a single service, product, course, class pack or
 * membership plan that is priced the other way. A business that is not
 * registered is never asked and is shown none
 * of these words.
 *
 * The maths here mirrors the API's rule in
 * `apps/api.saroh.in/src/modules/invoices/gst-price.ts` (`unitPayCents`,
 * `effectivePriceMode`). It is a preview only, for a form that lists typed
 * prices before anything is made: the order or booking the API returns is
 * the truth, and nothing here is ever sent.
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

/** A business's mode as read: absent (an older API) is "includes GST". */
export function businessModeOf(stored: unknown): GstPriceMode {
    return isGstPriceMode(stored) ? stored : DEFAULT_GST_PRICE_MODE;
}

/**
 * The mode an item is priced under: its own when it has one, else the
 * business's. Null (or anything unknown) on the item is "same as the
 * business".
 */
export function effectiveMode(business: unknown, item: unknown): GstPriceMode {
    return isGstPriceMode(item) ? item : businessModeOf(business);
}

/**
 * A rate in percent as basis points, without floating point: "18" → 1800,
 * "0.25" → 25, "5" → 500. Null when there is no rate, or it isn't one.
 */
export function rateBps(rate: string | null | undefined): number | null {
    if (rate === null || rate === undefined) return null;
    const match = /^(\d+)(?:\.(\d*))?$/.exec(rate.trim());
    if (!match) return null;
    const [, whole = "0", frac = ""] = match;
    return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

/**
 * The amount to pay for one unit of a typed price, in minor units. "GST is
 * added" on a registered business's item with a rate above 0 adds the GST,
 * rounded to the paisa, half up; everything else pays the typed price.
 */
export function unitPayCents(
    listCents: number,
    ratePercent: string | null | undefined,
    mode: GstPriceMode,
    registered: boolean,
): number {
    const bps = rateBps(ratePercent);
    if (!registered || mode !== "ADDED" || bps === null || bps <= 0) {
        return listCents;
    }
    return listCents + Math.round((listCents * bps) / 10_000);
}

/** The business's terms a preview prices by. */
export interface PriceTerms {
    registered: boolean;
    mode: GstPriceMode;
}

/** No GST: not registered, or it couldn't be told. The typed price stands. */
export const NO_GST_TERMS: PriceTerms = {
    registered: false,
    mode: DEFAULT_GST_PRICE_MODE,
};

/* ── Words ─────────────────────────────────────────────────────────── */

/** The Settings row's value, and the Activity log's. */
export const PRICE_MODE_SAYS: Record<GstPriceMode, string> = {
    INCLUDED: "Prices include GST",
    ADDED: "GST is added to prices",
};

/** The Settings row and its sheet. */
export const PRICE_MODE_ROW = "GST on your prices";

/** The two choices in the Settings sheet, each with what it means. */
export const PRICE_MODE_CHOICES: readonly {
    value: GstPriceMode;
    label: string;
    hint: string;
}[] = [
    {
        value: "INCLUDED",
        label: "My prices include GST",
        hint: "A ₹1,000 price is ₹1,000 to pay. The GST inside it shows on the invoice.",
    },
    {
        value: "ADDED",
        label: "GST is added to my prices",
        hint: "A ₹1,000 price at 18% is ₹1,180 to pay. Customers see the GST before they pay.",
    },
];

/**
 * Under the choices: what the choice covers, and what it leaves alone. It
 * covers everything sold with a rate of its own (12 Oct 2026: a course, a
 * class pack and a membership plan too). A member keeps the price they
 * joined at and pays by the choice from their next renewal, and nothing
 * already charged or invoiced changes.
 */
export const PRICE_MODE_SMALL_PRINT =
    "This is for the prices of your services, products, courses, class packs and membership plans. You can set any one of them differently where you edit it. Members already on a plan with a GST rate pay this way from their next renewal. Invoices already issued don't change, and orders and bookings already made keep what they were charged. A delivery charge and a line you type on an invoice are charged as typed, with GST included.";

/** What the Settings save says. */
export const PRICE_MODE_SAVED: Record<GstPriceMode, string> = {
    INCLUDED: "Prices now include GST",
    ADDED: "GST is now added to your prices",
};

/** The sentence a rates sheet opens its note with; none when unknown. */
export function pricesCarryGst(mode: GstPriceMode | null): string {
    if (mode === null) return "";
    return mode === "ADDED"
        ? "GST is added to your prices."
        : "Prices include GST.";
}

/* ── One service's or product's own choice ─────────────────────────── */

/** The select beside a service's or a product's price. */
export const ITEM_MODE_LABEL = "GST on this price";

/** The select's value for "same as the business": the API's null. */
export const SAME_AS_BUSINESS = "";
export type ItemModeValue = GstPriceMode | typeof SAME_AS_BUSINESS;

/** A saved item mode as the select's value. */
export function itemModeValue(stored: unknown): ItemModeValue {
    return isGstPriceMode(stored) ? stored : SAME_AS_BUSINESS;
}

/** The select's value as the API takes it: null is "same as the business". */
export function itemModeInput(value: string): GstPriceMode | null {
    return isGstPriceMode(value) ? value : null;
}

/**
 * The select's options. The first follows the business's own choice, so it
 * says what "the same" means today; where the business's choice couldn't be
 * read (`null`), it says only "Same as the business".
 */
export function itemModeOptions(
    business: GstPriceMode | null,
): { value: ItemModeValue; label: string }[] {
    const same =
        business === null
            ? "Same as the business"
            : business === "ADDED"
              ? "Same as the business (GST is added)"
              : "Same as the business (includes GST)";
    return [
        { value: SAME_AS_BUSINESS, label: same },
        { value: "INCLUDED", label: "Includes GST" },
        { value: "ADDED", label: "GST is added" },
    ];
}

/**
 * The note under a GST rate box beside a price: what the rate does to the
 * price under the mode in force. `fallback` is the box's usual note, kept
 * word for word while prices include GST.
 */
export function rateHint(
    business: GstPriceMode | null,
    item: string,
    fallback: string,
): string {
    if (business === null && !isGstPriceMode(item)) return fallback;
    return effectiveMode(business, item) === "ADDED"
        ? "The rate added on top of the price."
        : fallback;
}

import type {
    CheckoutQuote,
    CheckoutStanding,
    CheckoutStarted,
    ShopProblem,
    ShopResult,
} from "@saroh/site-blocks";

/**
 * The site checkout's answers (round-2 G13), narrowed, and every refusal
 * turned into the page's own words. Kept apart from `shop-checkout.ts`,
 * which reads the app's env, so they can be tested without one.
 *
 * No API text reaches the customer except the two sentences written for
 * them (a fourth open checkout, and the sold-out refund): the rest of the
 * API's messages are written for Saroh or the merchant.
 */

/** Whether this site takes an online order now, and how it leaves. */
export interface CheckoutOptions {
    canOrder: boolean;
    storefront: { name: string };
    currency: string;
    ways: { type: string; label: string; fee: string | null }[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}
const isString = (v: unknown): v is string => typeof v === "string";
const isStringOrNull = (v: unknown): v is string | null =>
    v === null || isString(v);
const WAYS = new Set(["PICKUP", "LOCAL_DELIVERY", "SHIPPING"]);
const LINE_STATES = new Set(["ok", "short", "sold-out", "gone"]);
const STANDINGS = new Set(["paying", "placed", "refunded", "closed"]);

function isWay(v: unknown): boolean {
    return (
        isRecord(v) &&
        isString(v.type) &&
        WAYS.has(v.type) &&
        isString(v.label) &&
        isStringOrNull(v.fee)
    );
}

export function isCheckoutOptions(v: unknown): v is CheckoutOptions {
    return (
        isRecord(v) &&
        typeof v.canOrder === "boolean" &&
        isRecord(v.storefront) &&
        isString(v.storefront.name) &&
        isString(v.currency) &&
        Array.isArray(v.ways) &&
        v.ways.every(isWay)
    );
}

function isLine(v: unknown): boolean {
    return (
        isRecord(v) &&
        isString(v.listingId) &&
        isStringOrNull(v.variantId) &&
        isStringOrNull(v.slug) &&
        isString(v.name) &&
        isStringOrNull(v.variantTitle) &&
        (v.image === null || (isRecord(v.image) && isString(v.image.url))) &&
        isString(v.unitPrice) &&
        typeof v.quantity === "number" &&
        isString(v.amount) &&
        isString(v.state) &&
        LINE_STATES.has(v.state) &&
        (v.available === null || typeof v.available === "number")
    );
}

export function isQuote(v: unknown): v is CheckoutQuote {
    return (
        isRecord(v) &&
        isString(v.currency) &&
        Array.isArray(v.lines) &&
        v.lines.every(isLine) &&
        Array.isArray(v.ways) &&
        v.ways.every(isWay) &&
        (v.fulfilment === null ||
            (isString(v.fulfilment) && WAYS.has(v.fulfilment))) &&
        isString(v.subtotal) &&
        isString(v.delivery) &&
        isString(v.total) &&
        typeof v.ready === "boolean"
    );
}

export function isStarted(v: unknown): v is CheckoutStarted {
    if (!isRecord(v) || !isRecord(v.payment)) return false;
    const p = v.payment;
    return (
        isString(v.orderId) &&
        isString(v.orderNumber) &&
        isString(v.total) &&
        isString(v.currency) &&
        isString(p.provider) &&
        typeof p.amountCents === "number" &&
        isString(p.currency) &&
        isStringOrNull(p.providerIntentId) &&
        isStringOrNull(p.publicKey) &&
        isRecord(p.clientParams)
    );
}

export function isStanding(v: unknown): v is CheckoutStanding {
    return (
        isRecord(v) &&
        isString(v.orderNumber) &&
        isString(v.state) &&
        STANDINGS.has(v.state) &&
        isString(v.total) &&
        isString(v.currency) &&
        isStringOrNull(v.message)
    );
}

export const SHOP_TROUBLE =
    "Something went wrong on our side. Please try again.";

const WORDS: Record<ShopProblem, string> = {
    "signed-out": "Sign in to place your order.",
    "bag-changed":
        "Something in your bag has changed. Check it, then place your order.",
    busy: "Too many tries just now. Wait a minute, then try again.",
    "cant-order":
        "This shop isn't taking orders online right now. Ask them about ordering instead.",
    invalid: "Check the details and try again.",
    error: SHOP_TROUBLE,
};

/** The API's error envelope: `{ error: { message, details } }`. */
function errorOf(body: unknown): { message?: string; reason?: string } {
    if (!isRecord(body)) return {};
    const e = isRecord(body.error) ? body.error : body;
    const details = isRecord(e.details) ? e.details : {};
    return {
        message: isString(e.message) ? e.message : undefined,
        reason: isString(details.reason) ? details.reason : undefined,
    };
}

/** What a refused call means for the customer. */
export function problemOf(
    status: number,
    body: unknown,
): { ok: false; reason: ShopProblem; message: string } {
    const { message, reason } = errorOf(body);
    const fail = (r: ShopProblem, words = WORDS[r]) => ({
        ok: false as const,
        reason: r,
        message: words,
    });
    if (status === 401) return fail("signed-out");
    if (status === 403) return fail("cant-order");
    if (status === 409 && reason === "bag-changed") return fail("bag-changed");
    if (status === 429) {
        // The one limit written for the customer: a fourth open checkout.
        return message?.startsWith("You have a checkout open already")
            ? fail("busy", message)
            : fail("busy");
    }
    if (status === 400) return fail("invalid");
    if (status === 409) return fail("bag-changed");
    return fail("error");
}

// ── What the site's server sends on ────────────────────────────────────────

const MAX_LINES = 30;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

interface CleanLine {
    listingId: string;
    variantId: string | null;
    quantity: number;
}

function cleanLines(v: unknown): CleanLine[] | null {
    if (!Array.isArray(v) || v.length > MAX_LINES) return null;
    const lines: CleanLine[] = [];
    for (const line of v) {
        if (!isRecord(line)) return null;
        const { listingId, variantId, quantity } = line;
        if (!isString(listingId) || !ID.test(listingId)) return null;
        if (variantId !== null && !(isString(variantId) && ID.test(variantId)))
            return null;
        if (
            typeof quantity !== "number" ||
            !Number.isInteger(quantity) ||
            quantity < 1 ||
            quantity > 99
        )
            return null;
        lines.push({ listingId, variantId, quantity });
    }
    return lines;
}

const cleanWay = (v: unknown): string | null =>
    isString(v) && WAYS.has(v) ? v : null;

const text = (v: unknown, max: number): string | undefined =>
    isString(v) && v.trim() ? v.trim().slice(0, max) : undefined;

/**
 * A quote request as the API takes it: lines and the way, rebuilt field by
 * field so nothing else the browser sent — a price above all — travels on.
 */
export function quoteBody(
    v: unknown,
): { lines: CleanLine[]; fulfilment?: string } | null {
    if (!isRecord(v)) return null;
    const lines = cleanLines(v.lines);
    if (!lines) return null;
    const way = cleanWay(v.fulfilment);
    return way ? { lines, fulfilment: way } : { lines };
}

/** A start request as the API takes it, rebuilt the same way. */
export function startBody(v: unknown): Record<string, unknown> | null {
    if (!isRecord(v)) return null;
    const lines = cleanLines(v.lines);
    const way = cleanWay(v.fulfilment);
    const key =
        isString(v.key) && /^[A-Za-z0-9_-]{8,64}$/.test(v.key) ? v.key : null;
    if (!lines || lines.length === 0 || !way || !key) return null;
    const body: Record<string, unknown> = { lines, fulfilment: way, key };
    const notes = text(v.notes, 500);
    if (notes) body.notes = notes;
    if (isRecord(v.address)) {
        const a = v.address;
        const address: Record<string, string> = {};
        for (const [name, max] of [
            ["name", 120],
            ["phone", 32],
            ["line1", 200],
            ["line2", 200],
            ["city", 100],
            ["state", 100],
            ["postalCode", 16],
        ] as const) {
            const value = text(a[name], max);
            if (value) address[name] = value;
        }
        body.address = address;
    }
    return body;
}

/**
 * The page holding the site's enquiry form, for "Ask about ordering" (G13):
 * the first published page with an enquiry section that has a form behind
 * it, home first. Null when the site has none.
 */
export function enquiryPagePath(snapshot: {
    pages: {
        path: string;
        isHome: boolean;
        sections: { type: string; content: unknown }[];
    }[];
}): string | null {
    const hasForm = (s: { type: string; content: unknown }) =>
        s.type === "enquiry" &&
        isRecord(s.content) &&
        isString(s.content.formId) &&
        s.content.formId.length > 0;
    const pages = [...snapshot.pages].sort(
        (a, b) => Number(b.isHome) - Number(a.isHome),
    );
    const page = pages.find((p) => p.sections.some(hasForm));
    if (!page) return null;
    if (page.isHome) return "/";
    return page.path.startsWith("/") ? page.path : `/${page.path}`;
}

/** An answer narrowed by `check`, or the problem it stands for. */
export function resultOf<T>(
    status: number,
    body: unknown,
    check: (v: unknown) => v is T,
): ShopResult<T> {
    if (status >= 200 && status < 300) {
        return check(body)
            ? { ok: true, data: body }
            : { ok: false, reason: "error", message: SHOP_TROUBLE };
    }
    return problemOf(status, body);
}

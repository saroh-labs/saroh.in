import type {
    CheckoutQuote,
    CheckoutStanding,
    CheckoutStarted,
    ShopProblem,
    ShopResult,
} from "@saroh/site-blocks";
import { isTestReleaseRefusal, TEST_RELEASE_MESSAGE } from "@saroh/site-blocks";

import { qrSourceTag } from "./qr-resolve";

/**
 * The site checkout's answers (round-2 G13), narrowed, and every refusal
 * turned into the page's own words. Kept apart from `shop-checkout.ts`,
 * which reads the app's env, so they can be tested without one.
 *
 * No API text reaches the customer except the sentences written for them
 * (a fourth open checkout, a fourth order waiting to be paid at the
 * handover, and the sold-out refund): the rest of the API's messages are
 * written for Saroh or the merchant.
 */

/** Whether this site takes an online order now, and how it leaves. */
export interface CheckoutOptions {
    canOrder: boolean;
    storefront: { name: string };
    currency: string;
    ways: { type: string; label: string; fee: string | null }[];
    /** How it can be paid; absent from an API before offline payment. */
    payments?: { online: boolean; onHandover: boolean };
    /**
     * True when the business stopped taking orders on this site for now
     * (#800): the shop says so instead of offering a bag or an enquiry.
     * Absent from an older API.
     */
    notTakingOrders?: boolean;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}
const isString = (v: unknown): v is string => typeof v === "string";
const isStringOrNull = (v: unknown): v is string | null =>
    v === null || isString(v);
const WAYS = new Set(["PICKUP", "LOCAL_DELIVERY", "SHIPPING"]);
const LINE_STATES = new Set(["ok", "short", "sold-out", "gone"]);
const STANDINGS = new Set([
    "paying",
    "placed",
    "refunding",
    "refunded",
    "closed",
    "to-pay",
]);
const PAYMENTS = new Set(["ONLINE", "ON_HANDOVER"]);

function isPayment(v: unknown): boolean {
    return (
        isRecord(v) &&
        isString(v.type) &&
        PAYMENTS.has(v.type) &&
        isString(v.label)
    );
}

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

/** Where a pick-up is collected (UX-025); absent from an older API. */
function isPickup(v: unknown): boolean {
    return (
        v === undefined ||
        v === null ||
        (isRecord(v) && isString(v.address) && isStringOrNull(v.hours))
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

/** "Free delivery over" on the quote; absent from an older API. */
function isFreeDelivery(v: unknown): boolean {
    return (
        v === undefined ||
        v === null ||
        (isRecord(v) && isString(v.over) && isStringOrNull(v.short))
    );
}

/** A code's answer on the quote (DEC-104); absent from an older API. */
function isDiscount(v: unknown): boolean {
    if (v === undefined || v === null) return true;
    if (!isRecord(v) || !isString(v.code)) return false;
    return v.applied === true
        ? isString(v.amount)
        : v.applied === false && isString(v.reason) && isString(v.message);
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
        isDiscount(v.discount) &&
        isFreeDelivery(v.freeDelivery) &&
        isString(v.total) &&
        typeof v.ready === "boolean" &&
        // Absent from an API before offline payment: online only.
        (v.payments === undefined ||
            (Array.isArray(v.payments) && v.payments.every(isPayment))) &&
        isPickup(v.pickup)
    );
}

export function isStarted(v: unknown): v is CheckoutStarted {
    if (!isRecord(v)) return false;
    const order =
        isString(v.orderId) &&
        isString(v.orderNumber) &&
        isString(v.total) &&
        isString(v.currency);
    // Paid at the handover: placed, with no window to open.
    if (v.payBy === "ON_HANDOVER") return order && v.payment === null;
    if (!isRecord(v.payment)) return false;
    const p = v.payment;
    return (
        order &&
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
    "payments-down":
        "The business can't take payment online right now. Please try again later, or pay them another way.",
    invalid: "Check the details and try again.",
    error: SHOP_TROUBLE,
    "test-release": TEST_RELEASE_MESSAGE,
};

/** The API's error envelope: `{ error: { message, details } }`. */
function errorOf(body: unknown): {
    message?: string;
    reason?: string;
    field?: string;
} {
    if (!isRecord(body)) return {};
    const e = isRecord(body.error) ? body.error : body;
    const details = isRecord(e.details) ? e.details : {};
    return {
        message: isString(e.message) ? e.message : undefined,
        reason: isString(details.reason) ? details.reason : undefined,
        field: isString(details.field) ? details.field : undefined,
    };
}

/** What a refused call means for the customer. */
export function problemOf(
    status: number,
    body: unknown,
): { ok: false; reason: ShopProblem; message: string } {
    const { message, reason, field } = errorOf(body);
    const fail = (r: ShopProblem, words = WORDS[r]) => ({
        ok: false as const,
        reason: r,
        message: words,
    });
    // A test host's write refused by the API (DEC-071, T4): said as a test
    // release, never as a bag that changed.
    if (isTestReleaseRefusal(status, body)) return fail("test-release");
    if (status === 401) return fail("signed-out");
    if (status === 403) return fail("cant-order");
    // The business's online payment failed just now (its provider, or keys
    // that won't open): said as that, never as our trouble, so the shopper
    // knows to try later or pay another way.
    if (
        status === 503 &&
        (reason === "provider-unavailable" ||
            reason === "provider-keys-refused")
    ) {
        return fail("payments-down");
    }
    // A code that stopped applying, said in the customer's words (DEC-104):
    // the checkout writes these sentences for the shopper.
    if (
        status === 409 &&
        reason === "bag-changed" &&
        field === "discountCode"
    ) {
        return message ? fail("bag-changed", message) : fail("bag-changed");
    }
    if (status === 409 && reason === "bag-changed") return fail("bag-changed");
    if (status === 429) {
        // The limits written for the customer: a fourth open checkout, or a
        // fourth order waiting to be paid at the handover.
        return message?.startsWith("You have other checkouts waiting") ||
            message?.startsWith("You have orders waiting")
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

/** A discount code as the API takes it, or undefined: never anything else. */
const cleanCode = (v: unknown): string | undefined => {
    if (!isString(v)) return undefined;
    const code = v.trim().toUpperCase();
    return /^[A-Z0-9_-]{1,32}$/.test(code) ? code : undefined;
};

const text = (v: unknown, max: number): string | undefined =>
    isString(v) && v.trim() ? v.trim().slice(0, max) : undefined;

/**
 * A quote request as the API takes it: lines and the way, rebuilt field by
 * field so nothing else the browser sent — a price above all — travels on.
 */
export function quoteBody(
    v: unknown,
): { lines: CleanLine[]; fulfilment?: string; discountCode?: string } | null {
    if (!isRecord(v)) return null;
    const lines = cleanLines(v.lines);
    if (!lines) return null;
    const way = cleanWay(v.fulfilment);
    const code = cleanCode(v.discountCode);
    return {
        lines,
        ...(way ? { fulfilment: way } : {}),
        ...(code ? { discountCode: code } : {}),
    };
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
    // Online unless the customer chose to pay at the handover.
    if (v.payment === "ON_HANDOVER") body.payment = "ON_HANDOVER";
    const notes = text(v.notes, 500);
    if (notes) body.notes = notes;
    const code = cleanCode(v.discountCode);
    if (code) body.discountCode = code;
    // The tag of the QR code whose scan opened the page, if it is one.
    const source = qrSourceTag(v.source);
    if (source) body.source = source;
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

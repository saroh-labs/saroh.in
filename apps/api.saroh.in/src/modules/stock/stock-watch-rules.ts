import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * "Tell me when it's back" (DEC-174 U23, #1154): the pure pieces, with no
 * service imports, so the public "Tell me", the stock writers' hook
 * (`on-sellable-again.ts`), the `stock.back-in-stock` run and the notice
 * read the same rules.
 *
 * **The stop link** in the email names one watch and is signed, so nobody
 * can stop a watch they weren't sent:
 *
 *     v1.<watch id>.<base64url(sig)>
 *
 * `sig` is HMAC-SHA256 over `stock-watch\nv1\n<watch id>`, keyed with the
 * site sign-in code secret (`site-accounts/site-secrets.ts`); the purpose
 * line keeps it apart from every other HMAC under that key (the waitlist
 * claim's). Nothing is stored. It never expires: stopping a watch that was
 * told or already stopped changes nothing. The emails carry it as a secret
 * link (DEC-178): the stored body holds a slot, never the token.
 */

/** The job that tells a product's watchers, held after stock comes back. */
export const BACK_IN_STOCK_TYPE = "stock.back-in-stock";

/**
 * How long stock must stay sellable before anyone is told (plan U23): long
 * enough for a count typed wrong to be put right unsent.
 */
export const BACK_IN_STOCK_DELAY_MS = 10 * 60_000;

/** The most watches one run tells; the rest are told by the next run. */
export const BACK_IN_STOCK_BATCH = 500;

/** What `stock.back-in-stock` carries: the product, never an address. */
export interface BackInStockPayload {
    productId: string;
}

/** A customer notice's once-only key: once per watch. */
export function backInStockNoticeKey(watchId: string): string {
    return `back-in-stock:${watchId}`;
}

/**
 * The "We'll email you when it's back" key (DEC-178, #1170): once per
 * watch, so a job run twice sends it once.
 */
export function backInStockWaitingNoticeKey(watchId: string): string {
    return `back-in-stock-waiting:${watchId}`;
}

/** The longest address a watch keeps (RFC 5321's path limit). */
export const MAX_WATCH_EMAIL = 254;

/**
 * The address as a watch keeps it: trimmed and lower-cased, so the same
 * person asking twice is one watch. Null for anything that isn't a plain
 * `local@domain.tld` address.
 */
export function watchEmail(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const email = value.trim().toLowerCase();
    if (email.length === 0 || email.length > MAX_WATCH_EMAIL) return null;
    return /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z0-9-]{2,}$/.test(email)
        ? email
        : null;
}

// ---- The stop link ---------------------------------------------------------

const VERSION = "v1";
const PURPOSE = "stock-watch";
const MAX_TOKEN_LENGTH = 120;
/** A cuid watch id. */
const TOKEN = /^v1\.([a-z0-9]{8,40})\.([A-Za-z0-9_-]{43})$/;

function signature(secret: string, watchId: string): Buffer {
    return createHmac("sha256", secret)
        .update(`${PURPOSE}\n${VERSION}\n${watchId}`)
        .digest();
}

/** The stop link's token for one watch. */
export function signWatchToken(secret: string, watchId: string): string {
    const sig = signature(secret, watchId).toString("base64url");
    return [VERSION, watchId, sig].join(".");
}

/** The watch a token names, or null: malformed or forged. Never throws. */
export function verifyWatchToken(
    secret: string,
    token: unknown,
): string | null {
    if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) {
        return null;
    }
    const m = TOKEN.exec(token);
    if (!m) return null;
    const watchId = m[1];
    const given = Buffer.from(m[2], "base64url");
    const expected = signature(secret, watchId);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        return null;
    }
    return watchId;
}

/**
 * The stop page's address on the business's site, where the visitor
 * presses "Stop waiting" (U24 draws it). A page and a button, never a
 * link that stops on opening: mail scanners open links.
 */
export function stopWaitingPath(token: string): string {
    return `/shop/stop-waiting/${encodeURIComponent(token)}`;
}

/** A product's page on the business's site. */
export function productPath(slug: string): string {
    return `/shop/${encodeURIComponent(slug)}`;
}

// ---- Where a watch stands --------------------------------------------------

/**
 * What the stop page says:
 * - `waiting`: still waiting; the page offers "Stop waiting".
 * - `told`: they were emailed; nothing to stop.
 * - `stopped`: they stopped it.
 */
export type WatchState = "waiting" | "told" | "stopped";

export function watchState(watch: {
    toldAt: Date | null;
    cancelledAt: Date | null;
}): WatchState {
    if (watch.cancelledAt) return "stopped";
    if (watch.toldAt) return "told";
    return "waiting";
}

/**
 * Why "Tell me" isn't offered for a product on a site, in the words the
 * site would show; the site hides the button for every one of them.
 */
export type WatchRefusal =
    /** The business turned Back in stock off. */
    | "SWITCHED_OFF"
    /** The business has no email provider of its own connected. */
    | "NO_EMAIL"
    /** It can be bought now. */
    | "IN_STOCK";

export const WATCH_REFUSAL_WORDS: Record<WatchRefusal, string> = {
    SWITCHED_OFF: "This shop doesn't send back-in-stock emails.",
    NO_EMAIL: "This shop can't send back-in-stock emails yet.",
    IN_STOCK: "This is in stock now.",
};

import {
    isTestReleaseRefusal,
    TEST_RELEASE_MESSAGE,
} from "../test-release/words";

/**
 * "Tell me when it's back" on a business's site (DEC-174, automatic notices
 * U24, #1155): what the API's watch routes answer (U23, #1154), narrowed
 * field by field, and every sentence the product page and the stop page
 * say about it. Plain, with no "use client", so the site's server actions
 * read the same shapes and words the blocks draw.
 *
 * - `GET  public/sites/:siteId/products/:productId/watch[?variantId=]` →
 *   {@link WatchOffer}
 * - `POST` the same → {@link WatchTaken}; 409 with a `reason` when it
 *   isn't offered, 429 past a limit, 409 TEST_RELEASE on a test release
 * - `GET  public/sites/:siteId/stock-watch/:token` → {@link WatchView}
 * - `POST public/sites/:siteId/stock-watch/:token/stop` → {@link WatchView}
 */

/** Why "Tell me" isn't offered: switched off, no email of its own, in stock. */
export type WatchRefusal = "SWITCHED_OFF" | "NO_EMAIL" | "IN_STOCK";

/** Whether the site offers "Tell me" for a product, or one option of it. */
export interface WatchOffer {
    offered: boolean;
    why: WatchRefusal | null;
}

/** A "Tell me" taken: waiting, with the way to stop it when this made it. */
export interface WatchTaken {
    state: "waiting";
    /**
     * For "Stop waiting" right after. Null when the address was already
     * waiting: typing someone's address never hands over a way to stop
     * theirs.
     */
    stopToken: string | null;
}

/** Where a watch stands, for the stop page. */
export type WatchState = "waiting" | "told" | "stopped";

export interface WatchView {
    state: WatchState;
    business: string;
    /** "Linen shirt", or "Linen shirt (Blue / M)". */
    product: string;
}

/**
 * Why something couldn't be done, with the sentence for it.
 * - invalid: the address (said under the field).
 * - not-offered: the business doesn't take "Tell me" for it now.
 * - busy: too many tries.
 * - missing: a stop link that isn't this business's, or isn't one.
 * - test-release: a test release (DEC-071); nothing is saved.
 */
export type WatchProblem =
    "invalid" | "not-offered" | "busy" | "missing" | "test-release" | "error";

export type WatchResult<T> =
    | { ok: true; data: T }
    | { ok: false; reason: WatchProblem; message: string };

/** The site's server actions, handed to the product page's form and the stop page. */
export interface BackInStockApi {
    offer: (
        productId: string,
        variantId: string | null,
    ) => Promise<WatchResult<WatchOffer>>;
    watch: (input: {
        productId: string;
        variantId: string | null;
        email: string;
    }) => Promise<WatchResult<WatchTaken>>;
    stop: (token: string) => Promise<WatchResult<WatchView>>;
}

const REFUSALS: readonly WatchRefusal[] = [
    "SWITCHED_OFF",
    "NO_EMAIL",
    "IN_STOCK",
];
const STATES: readonly WatchState[] = ["waiting", "told", "stopped"];

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function isWatchOffer(v: unknown): v is WatchOffer {
    return (
        isRecord(v) &&
        typeof v.offered === "boolean" &&
        (v.why === null || REFUSALS.includes(v.why as WatchRefusal))
    );
}

export function isWatchTaken(v: unknown): v is WatchTaken {
    return (
        isRecord(v) &&
        v.state === "waiting" &&
        (v.stopToken === null || typeof v.stopToken === "string")
    );
}

export function isWatchView(v: unknown): v is WatchView {
    return (
        isRecord(v) &&
        STATES.includes(v.state as WatchState) &&
        typeof v.business === "string" &&
        typeof v.product === "string"
    );
}

// ── Words ──────────────────────────────────────────────────────────────────

export const WATCH_WORDS = {
    label: "Your email",
    button: "Tell me when it's back",
    saving: "Saving…",
    stop: "Stop waiting",
    stopping: "Stopping…",
    stopped: "You won't be emailed about it.",
    invalid: "Enter an email like name@example.com.",
    busy: "Too many tries. Wait a minute and try again.",
    error: "We couldn't save that. Try again.",
    offline: "We couldn't reach the shop. Check your connection and try again.",
    stopFailed: "We couldn't stop it. Try again.",
} as const;

/**
 * Under the button: the opt-in, said plainly. Two emails since DEC-178: a
 * short one now, with "Stop waiting", and the one when it's back.
 */
export function consentLine(business: string): string {
    return `${business} will email you now and when it's back. Nothing else.`;
}

/** Once the address is taken. */
export function waitingLine(email: string): string {
    return `We'll email you at ${email}.`;
}

/** Why "Tell me" isn't offered, as the visitor is told after a refusal. */
export const REFUSAL_WORDS: Record<WatchRefusal, string> = {
    SWITCHED_OFF: "This shop doesn't send back-in-stock emails.",
    NO_EMAIL: "This shop can't send back-in-stock emails yet.",
    IN_STOCK: "This is in stock now. Refresh the page to buy it.",
};

/**
 * The address as the API keeps it, trimmed and lower-cased, or null for
 * anything that isn't a plain `local@domain.tld` (the API's own rule,
 * `watchEmail`), so a typo is said under the field before anything is sent.
 */
export function cleanWatchEmail(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const email = value.trim().toLowerCase();
    if (email.length === 0 || email.length > 254) return null;
    return /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z0-9-]{2,}$/.test(email)
        ? email
        : null;
}

/** What the stop page says for each way a watch can stand. */
export function stopWaitingWords(view: WatchView): {
    eyebrow: string;
    title: string;
    body: string;
} {
    switch (view.state) {
        case "waiting":
            return {
                eyebrow: "Back in stock",
                title: `Stop waiting for ${view.product}?`,
                body: `${view.business} will email you once when it's back. Stop waiting and you won't get that email.`,
            };
        case "told":
            return {
                eyebrow: "Back in stock",
                title: `We've emailed you about ${view.product}`,
                body: `${view.business} emailed you when it was back. There's nothing to stop.`,
            };
        case "stopped":
            return {
                eyebrow: "Back in stock",
                title: "You've stopped waiting",
                body: `You won't be emailed when ${view.product} is back at ${view.business}.`,
            };
    }
}

// ── The API's refusals ─────────────────────────────────────────────────────

function errorOf(body: unknown): {
    message?: string;
    reason?: string;
    field?: string;
} {
    if (!isRecord(body)) return {};
    const e = isRecord(body.error) ? body.error : body;
    const details = isRecord(e.details) ? e.details : {};
    const pick = (k: string) =>
        typeof details[k] === "string"
            ? details[k]
            : typeof e[k] === "string"
              ? e[k]
              : undefined;
    return {
        message: typeof e.message === "string" ? e.message : undefined,
        reason: pick("reason"),
        field: pick("field"),
    };
}

/** A refused watch call, in the visitor's words: never the API's text. */
export function watchProblemOf(
    status: number,
    body: unknown,
): { ok: false; reason: WatchProblem; message: string } {
    const fail = (reason: WatchProblem, message: string) => ({
        ok: false as const,
        reason,
        message,
    });
    if (isTestReleaseRefusal(status, body)) {
        return fail("test-release", TEST_RELEASE_MESSAGE);
    }
    const { reason } = errorOf(body);
    if (status === 409 && REFUSALS.includes(reason as WatchRefusal)) {
        return fail("not-offered", REFUSAL_WORDS[reason as WatchRefusal]);
    }
    if (status === 400) return fail("invalid", WATCH_WORDS.invalid);
    if (status === 404) return fail("missing", WATCH_WORDS.error);
    if (status === 429) return fail("busy", WATCH_WORDS.busy);
    return fail("error", WATCH_WORDS.error);
}

/** An answer narrowed by `check`, or the problem it stands for. */
export function watchResultOf<T>(
    status: number,
    body: unknown,
    check: (v: unknown) => v is T,
): WatchResult<T> {
    if (status >= 200 && status < 300) {
        return check(body)
            ? { ok: true, data: body }
            : { ok: false, reason: "error", message: WATCH_WORDS.error };
    }
    return watchProblemOf(status, body);
}

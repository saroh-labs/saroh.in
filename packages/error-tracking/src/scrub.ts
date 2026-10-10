/**
 * The one scrubber every error passes through before it leaves Saroh
 * (DEC-125). The API, the Workers and the browser reporter all call it; a
 * tracker's own scrubbing is a second net, never the first.
 *
 * What it removes from an error's words and stack, in this order:
 *
 *  1. `Authorization`, `Cookie`, `Set-Cookie` and API-key header lines:
 *     everything after the header's name.
 *  2. Query strings and fragments of any URL or path (`/x?token=…` → `/x`):
 *     tokens and emails live there.
 *  3. `Bearer …` and `Basic …` credentials.
 *  4. Values written beside a sensitive name (`password=…`, `"token": "…"`).
 *  5. JSON Web Tokens and keys with a known provider prefix.
 *  6. Email addresses.
 *  7. Long mixed strings of letters and digits (32+): keys, hashes, tokens.
 *  8. Phone-like and other long numbers (10+ digits, with spaces or dashes).
 *
 * Bodies are never passed in at all: a caller hands over an error and a few
 * named ids, and {@link scrubContext} drops any key that could hold one.
 */

/** Longest message kept; an error message is not a place for a payload. */
export const MAX_MESSAGE_LENGTH = 500;
/** Longest stack kept, in lines and in characters. */
export const MAX_STACK_LINES = 50;
export const MAX_STACK_LENGTH = 8_000;

/** Header lines whose value is a credential or a session. */
const SENSITIVE_HEADER =
    /\b(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-saroh-[a-z-]*(?:key|secret|token))\b\s*[:=]\s*[^\n]*/giu;

/** A query string or fragment on a URL or path: `?a=b`, `#x=y`. */
const QUERY_STRING = /([\w/.:@%~+-])[?#][^\s"'`)<>\]]*/gu;

const CREDENTIAL_SCHEME = /\b(Bearer|Basic)\s+[\w.~+/=-]+/giu;

/** `password=…`, `token: …`, `"apiKey": "…"`, `secret => …`. */
const NAMED_SECRET =
    /(["']?\b(?:pass(?:word|wd)?|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret|signature|otp|session(?:[_-]?id)?|credential)s?\b["']?\s*(?:=>|[:=])\s*)(["']?)[^\s"',;&)}\]]+\2/giu;

const JWT = /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]*/gu;

/** Keys that announce themselves by prefix (payment, storage, tracker, git). */
const PREFIXED_KEY =
    /\b(?:sk|pk|rk|rzp|phc|phx|whsec|ghp|gho|ghs|github_pat|xox[abprs]|AKIA|ASIA)[_-]?(?:live|test)?[_-]?[A-Za-z0-9]{12,}\b/gu;

const EMAIL = /[\w.+%-]+(?:@|%40)[\w-]+(?:\.[\w-]+)+/giu;

/** 32+ characters of one unbroken token: checked for digits before masking. */
const LONG_TOKEN = /\b[A-Za-z0-9_-]{32,}\b/gu;

/** A phone number or any other long number: 10+ digits, spaced or dashed. */
const LONG_NUMBER = /\+?\d[\d\s().-]{8,}\d/gu;

/** Whether a long token mixes letters and digits, as keys and hashes do. */
function looksLikeSecret(token: string): boolean {
    return /\d/u.test(token) && /[A-Za-z]/u.test(token);
}

/** Mask what an error's words should never carry. No length cap. */
export function scrubText(text: string): string {
    return text
        .replace(SENSITIVE_HEADER, "$1: [secret]")
        .replace(QUERY_STRING, "$1")
        .replace(CREDENTIAL_SCHEME, "$1 [token]")
        .replace(NAMED_SECRET, "$1[secret]")
        .replace(JWT, "[token]")
        .replace(PREFIXED_KEY, "[secret]")
        .replace(EMAIL, "[email]")
        .replace(LONG_TOKEN, (token) =>
            looksLikeSecret(token) ? "[secret]" : token,
        )
        .replace(LONG_NUMBER, (match) =>
            match.replace(/\D/gu, "").length >= 10 ? "[number]" : match,
        );
}

/** An error message: scrubbed and capped. */
export function scrubMessage(message: string): string {
    return scrubText(message).slice(0, MAX_MESSAGE_LENGTH);
}

/** A stack: scrubbed, at most {@link MAX_STACK_LINES} lines. */
export function scrubStack(stack: string): string {
    return scrubText(
        stack.split("\n").slice(0, MAX_STACK_LINES).join("\n"),
    ).slice(0, MAX_STACK_LENGTH);
}

/** What can be said about a thrown value, already scrubbed. */
export interface ScrubbedError {
    name: string;
    message: string;
    stack?: string;
}

/**
 * A thrown value's name, message and stack, scrubbed. Read by shape, not by
 * `instanceof Error` (false for an error from another realm). A value that
 * isn't error-shaped is never stringified: it may be a body.
 */
export function scrubError(error: unknown): ScrubbedError {
    if (
        typeof error === "object" &&
        error !== null &&
        typeof (error as { message?: unknown }).message === "string"
    ) {
        const e = error as { name?: unknown; message: string; stack?: unknown };
        return {
            name:
                typeof e.name === "string" && e.name
                    ? scrubText(e.name).slice(0, 100)
                    : "Error",
            message: scrubMessage(e.message),
            ...(typeof e.stack === "string" && e.stack
                ? { stack: scrubStack(e.stack) }
                : {}),
        };
    }
    return {
        name: "Error",
        message:
            typeof error === "string"
                ? scrubMessage(error)
                : "A non-Error value was thrown",
    };
}

/** A path segment that names one record, person or secret, not a screen. */
function isIdSegment(segment: string): boolean {
    if (segment.length > 40) return true;
    if (/^\d+$/u.test(segment)) return true;
    if (/@|%40/iu.test(segment)) return true;
    // UUIDs, and hex ids of 8 or more.
    if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(segment))
        return true;
    if (/^[0-9a-f]{8,}$/iu.test(segment) && /\d/u.test(segment)) return true;
    // cuid-like and other generated ids: 16+ letters and digits, mixed.
    if (/^[A-Za-z0-9_-]{16,}$/u.test(segment) && /\d/u.test(segment))
        return true;
    // Document numbers: letters, a dash, digits (ORD-001, INV-2026-0042).
    if (/^[A-Za-z]{2,5}(?:-\d+)+$/u.test(segment)) return true;
    return false;
}

/**
 * A URL or path reduced to its route's shape: no origin, no query, no
 * fragment, and every segment that names one record replaced by `:id`
 * (`/commerce/orders/cmf3k2…/edit?tab=1` → `/commerce/orders/:id/edit`).
 * Where the framework knows the real template (Express's `req.route.path`,
 * Next's `routePath`), pass that instead; this is the fallback.
 */
export function routeTemplate(urlOrPath: string): string {
    let path = urlOrPath;
    const scheme = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/iu.exec(path);
    if (scheme) path = path.slice(scheme[0].length);
    path = path.split(/[?#]/u)[0] ?? "";
    if (!path.startsWith("/")) path = `/${path}`;
    const segments = path
        .split("/")
        .map((segment) => (segment && isIdSegment(segment) ? ":id" : segment));
    return segments.join("/").slice(0, 200) || "/";
}

/** Context keys that could carry a body, a header, a credential or a person. */
const FORBIDDEN_KEY =
    /body|payload|header|cookie|authori[sz]ation|query|search|params|password|secret|token|credential|email|phone|mobile|address|name$|^ip$|ipaddress|user-?agent|amount|price|total/iu;

/** Context keys that are names of things, not of people, and so are kept. */
const ALLOWED_NAME_KEYS = new Set(["error_name", "event_name"]);

/**
 * The few named facts sent beside an error: only strings, numbers and
 * booleans, never under a key that could hold a body, a header, a credential,
 * money or a person's details, and every string scrubbed and capped.
 */
export function scrubContext(
    context: Record<string, unknown>,
): Record<string, string | number | boolean> {
    const out: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(context)) {
        if (FORBIDDEN_KEY.test(key) && !ALLOWED_NAME_KEYS.has(key)) continue;
        if (typeof value === "string") {
            if (value) out[key] = scrubText(value).slice(0, 200);
        } else if (typeof value === "number" && Number.isFinite(value)) {
            out[key] = value;
        } else if (typeof value === "boolean") {
            out[key] = value;
        }
    }
    return out;
}

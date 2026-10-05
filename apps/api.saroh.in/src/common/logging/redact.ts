/**
 * Denylist-based redaction for anything we might write to logs. Nothing on
 * these lists ever reaches the log sink; values are replaced with {@link
 * REDACTED}. Keys are compared case-insensitively and with `-`/`_` stripped so
 * `X-API-Key`, `x_api_key` and `apiKey` all match the same entry.
 */
export const REDACTED = "[REDACTED]";

/** Header names whose values must never be logged. */
export const SENSITIVE_HEADERS = new Set<string>([
    "authorization",
    "proxy-authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "x-auth-token",
    // A merchant site's signed relay carries the visitor's address, and the
    // customer session header is the session itself (ADR-011, plan A).
    "x-saroh-relay",
    "x-customer-session",
    // A test release link's secret, sent by the renderer (DEC-071, KTD-6).
    "x-saroh-test-token",
]);

/** Body/field names (normalised) whose values must never be logged. */
export const SENSITIVE_FIELDS = new Set<string>([
    "password",
    "newpassword",
    "oldpassword",
    "currentpassword",
    "confirmpassword",
    "token",
    "accesstoken",
    "refreshtoken",
    "idtoken",
    "sessiontoken",
    "secret",
    "clientsecret",
    "apikey",
    "authorization",
    "cookie",
    "email",
    "phone",
    "phonenumber",
    "creditcard",
    "cardnumber",
    "cvv",
    "cvc",
    "ssn",
    // What a booker tells the team on the booking page (E7): medicines,
    // allergies, pregnancy. Sensitive, so never logged.
    "intakenote",
]);

/** Cap recursion so a hostile/cyclic-ish payload can't blow the stack. */
const MAX_DEPTH = 4;

function normalizeKey(key: string): string {
    return key.toLowerCase().replace(/[-_]/g, "");
}

/** Returns a shallow copy of headers with sensitive values redacted. */
export function redactHeaders(
    headers: Record<string, unknown>,
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(headers)) {
        result[key] = SENSITIVE_HEADERS.has(key.toLowerCase())
            ? REDACTED
            : value;
    }
    return result;
}

/** Deep-copies a value, redacting any field whose name is on the denylist. */
export function redactObject(value: unknown, depth = 0): unknown {
    if (depth >= MAX_DEPTH) {
        return value;
    }
    if (Array.isArray(value)) {
        return (value as unknown[]).map((item) =>
            redactObject(item, depth + 1),
        );
    }
    if (value !== null && typeof value === "object") {
        const result: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(
            value as Record<string, unknown>,
        )) {
            result[key] = SENSITIVE_FIELDS.has(normalizeKey(key))
                ? REDACTED
                : redactObject(val, depth + 1);
        }
        return result;
    }
    return value;
}

/**
 * Public routes whose path carries a secret: the token IS the credential, so
 * the path is logged with it replaced. Review links are stored only as a hash;
 * a log line with the raw token would undo that. Preview links, the same.
 */
const TOKEN_PATHS = [
    /^(\/public\/product-reviews\/)[^/?#]+/,
    /^(\/public\/invoices\/)[^/?#]+/,
    // An order's pay link (B11).
    /^(\/public\/order-pay\/)[^/?#]+/,
    // A pay-now hold's pay token (U19), read and released by it.
    /^(\/public\/services\/holds\/)[^/?#]+/,
    /^(\/public\/sites\/preview\/)[^/?#]+/,
];

/**
 * Public tools whose query string is a stranger's own input: the link
 * preview tool's address someone checked (resources plan U2). The tool
 * takes it in the body; this keeps it out of the log even if a caller puts
 * it in the query string anyway.
 */
const QUERY_FREE_PATHS = [/^\/public\/tools\//];

export function redactUrl(url: string): string {
    if (QUERY_FREE_PATHS.some((pattern) => pattern.test(url))) {
        return url.split("?")[0] ?? "";
    }
    for (const pattern of TOKEN_PATHS) {
        if (pattern.test(url)) return url.replace(pattern, "$1[token]");
    }
    return url;
}

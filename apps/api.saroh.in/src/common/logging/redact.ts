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

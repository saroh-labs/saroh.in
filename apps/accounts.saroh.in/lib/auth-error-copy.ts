/**
 * What a failed sign-in, sign-up or account change says, in one place.
 *
 * Better Auth's own messages are written for developers ("Invalid email or
 * password", "Password too short", "Invalid OTP") and a network failure
 * carries the browser's ("Failed to fetch"). None of them is shown: every
 * screen in this app passes the failure's code through `authErrorCopy` and
 * shows the sentence it gets back (`docs/patterns/frontend-error-feedback.md`:
 * never an exception's `error.message`).
 *
 * The sentences never say whether an address has an account, and each ends
 * with a full stop.
 */

/** The request never reached Saroh: offline, DNS, a dropped connection. */
export const NETWORK_ERROR = "NETWORK_ERROR";

/** A 429 from the API's rate limiter, which sends no code of its own. */
export const TOO_MANY_REQUESTS = "TOO_MANY_REQUESTS";

export const AUTH_ERROR_FALLBACK = "That didn't work. Try again.";

const COPY: Record<string, string> = {
    // Signing in. One sentence for a wrong address and a wrong password.
    INVALID_EMAIL_OR_PASSWORD:
        "That email or password isn't right. Check both and try again.",
    INVALID_PASSWORD: "That password isn't right. Check it and try again.",
    INVALID_EMAIL:
        "That doesn't look like an email address. Check it and try again.",
    // A field left empty or mistyped (the forms send without the browser's
    // own checks, so the API is what notices).
    VALIDATION_ERROR:
        "Something is missing or mistyped. Check each field and try again.",
    MISSING_FIELD:
        "Something is missing or mistyped. Check each field and try again.",
    // Too many tries.
    [TOO_MANY_REQUESTS]: "Too many tries. Wait a minute, then try again.",
    TOO_MANY_ATTEMPTS:
        "Too many wrong codes. Ask for a new code below to keep going.",
    // The network.
    [NETWORK_ERROR]:
        "Couldn't reach Saroh. Check your connection and try again.",
    // A weak password.
    PASSWORD_TOO_SHORT:
        "That password is too short. Use eight characters or more.",
    PASSWORD_TOO_LONG: "That password is too long. Use a shorter one.",
    // The emailed code.
    INVALID_OTP: "That code isn't right. Check it and try again.",
    OTP_EXPIRED: "That code has expired. Ask for a new one below.",
    // A link from an email.
    INVALID_TOKEN:
        "That link has expired or was already used. Ask for a new one.",
    TOKEN_EXPIRED:
        "That link has expired or was already used. Ask for a new one.",
    // An account change that needs a recent sign-in.
    SESSION_EXPIRED: "Sign in again to do this.",
    SESSION_NOT_FRESH: "Sign in again to do this.",
    // Changing the address to one that is taken.
    USER_ALREADY_EXISTS: "That email can't be used. Try another.",
    USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
        "That email can't be used. Try another.",
};

/** What the auth client hands back when a call fails. */
export interface AuthFailure {
    code?: string;
    status?: number;
}

/** The code to look up: the failure's own, or one for a bare 429. */
export function authErrorCode(
    failure: AuthFailure | null | undefined,
): string | undefined {
    if (!failure) return undefined;
    if (failure.code) return failure.code;
    return failure.status === 429 ? TOO_MANY_REQUESTS : undefined;
}

/**
 * The sentence for a failure's code. `fallback` is for a screen that can say
 * what it was doing ("Couldn't save your name. Try again."), and must be a
 * sentence of the screen's own, never the library's message.
 */
export function authErrorCopy(
    code: string | undefined,
    fallback: string = AUTH_ERROR_FALLBACK,
): string {
    // `hasOwn`, so a code that happens to name something every object has
    // ("constructor") is not mistaken for a sentence.
    return code && Object.hasOwn(COPY, code)
        ? (COPY[code] ?? fallback)
        : fallback;
}

/** {@link authErrorCopy} for a failure as the auth client returns it. */
export function authFailureCopy(
    failure: AuthFailure | null | undefined,
    fallback?: string,
): string {
    return authErrorCopy(authErrorCode(failure), fallback);
}

/**
 * What a provider's button says when its round-trip never starts. Its own
 * sentence, not the shared fallback, because there is another way in on the
 * same page and it says so.
 */
export function socialErrorCopy(
    label: string,
    failure: AuthFailure | null | undefined,
): string {
    return authErrorCode(failure) === NETWORK_ERROR
        ? `Couldn't reach ${label}. Check your connection and try again.`
        : `Couldn't open ${label}. Try again, or use your email and password.`;
}

/**
 * Run an auth call so a network failure comes back like any other failure.
 * The auth client REJECTS when the request never leaves the browser, which
 * left a form stuck on "Signing in…" with nothing said.
 */
export async function settle<T extends { error: AuthFailure | null }>(
    call: () => Promise<T>,
): Promise<T | { data: null; error: AuthFailure }> {
    try {
        return await call();
    } catch {
        return { data: null, error: { code: NETWORK_ERROR } };
    }
}

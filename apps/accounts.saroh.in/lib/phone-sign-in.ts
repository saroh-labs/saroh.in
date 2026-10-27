import type { AuthFailure } from "./auth-error-copy";
import { NETWORK_ERROR, TOO_MANY_REQUESTS } from "./auth-error-copy";
import { apiBase } from "./sign-in-options";

/**
 * Phone sign-in for Saroh accounts (DEC-196): the API's four calls, from
 * the browser with the session cookie (`credentials: "include"`), as the
 * auth client's own calls are. The sign-in sets Better Auth's session
 * cookie on its answer, which only a call from the browser can receive.
 *
 * Every refusal comes back as an {@link AuthFailure} carrying the API's own
 * sentence (`words`), which the screens show as it is.
 */

/** What the browser opens after a start: the widget, or (dev/test) a stand-in. */
export type PhoneStart =
    | {
          widget: { widgetId: string; tokenAuth: string; scriptUrl: string };
      }
    | { standIn: { token: string } };

export interface PhoneOptions {
    available: boolean;
    turnstileSiteKey: string | null;
}

export type PhoneAnswer<T> =
    | { data: T; error: null }
    | { data: null; error: AuthFailure; retryAfter: number | null };

/** Whether the sign-in page offers a phone, read on this app's server. */
export async function phoneOptions(): Promise<PhoneOptions> {
    try {
        const response = await fetch(`${apiBase()}/account-phone/options`, {
            cache: "no-store",
        });
        if (!response.ok) return { available: false, turnstileSiteKey: null };
        return (await response.json()) as PhoneOptions;
    } catch {
        return { available: false, turnstileSiteKey: null };
    }
}

export function startPhone(input: {
    phone: string;
    turnstileToken?: string | null;
}): Promise<PhoneAnswer<PhoneStart>> {
    return call("POST", "/account-phone/start", {
        phone: input.phone,
        ...(input.turnstileToken
            ? { turnstileToken: input.turnstileToken }
            : {}),
    });
}

/** The widget's token, checked by the API; the answer sets the session cookie. */
export function signInWithPhone(input: {
    phone: string;
    accessToken: string;
}): Promise<PhoneAnswer<{ signedIn: true }>> {
    return call("POST", "/account-phone/sign-in", input);
}

export function addPhone(input: {
    phone: string;
    accessToken: string;
}): Promise<PhoneAnswer<{ phoneE164: string; phoneVerifiedAt: string }>> {
    return call("POST", "/account/phone", input);
}

export function removePhone(): Promise<PhoneAnswer<null>> {
    return call("DELETE", "/account/phone");
}

async function call<T>(
    method: "POST" | "DELETE",
    path: string,
    body?: unknown,
): Promise<PhoneAnswer<T>> {
    let response: Response;
    try {
        response = await fetch(`${apiBase()}${path}`, {
            method,
            credentials: "include",
            headers:
                body === undefined
                    ? undefined
                    : { "content-type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch {
        return {
            data: null,
            error: { code: NETWORK_ERROR },
            retryAfter: null,
        };
    }
    if (response.ok) {
        const text = await response.text();
        return { data: (text ? JSON.parse(text) : null) as T, error: null };
    }
    return { data: null, ...(await refusal(response)) };
}

/** The API's envelope (`{ error: { message, details } }`) as a failure. */
export async function refusal(
    response: Response,
): Promise<{ error: AuthFailure; retryAfter: number | null }> {
    let message: unknown;
    let details: { code?: unknown; retryAfter?: unknown } | undefined;
    try {
        const raw = (await response.json()) as {
            error?: { message?: unknown; details?: typeof details };
        };
        message = raw.error?.message;
        details = raw.error?.details;
    } catch {
        // No body: the status alone.
    }
    const code =
        response.status === 429
            ? TOO_MANY_REQUESTS
            : typeof details?.code === "string"
              ? details.code
              : undefined;
    return {
        error: {
            code,
            status: response.status,
            // A 5xx's words are the API's generic ones: the screen's own fallback reads better.
            ...(typeof message === "string" && response.status < 500
                ? { words: message }
                : {}),
        },
        retryAfter:
            typeof details?.retryAfter === "number" ? details.retryAfter : null,
    };
}

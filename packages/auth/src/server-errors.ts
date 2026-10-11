import type { BetterAuthOptions } from "better-auth";
import { isAPIError } from "better-auth/api";

/**
 * A fault of ours inside Better Auth: the request was answered 5xx. Only the
 * thrown value and the status; the hook Better Auth offers is not handed the
 * request, so the host adds the method, the route and its own request id.
 */
export interface AuthServerFault {
    error: unknown;
    /** The status the caller was answered with: always 500 or more. */
    status: number;
}

export type OnAuthServerError = (fault: AuthServerFault) => void;

/**
 * The status Better Auth answers a thrown value with, or null when the
 * answer isn't a server fault.
 *
 * Better Auth's router answers an `APIError` with that error's own status
 * (wrong password 401, unverified email 403, too many requests 429, a
 * redirect 302) and anything else with a bare 500. So an `APIError` below
 * 500 is an outcome, not a fault, and is never reported.
 */
export function serverFaultStatus(error: unknown): number | null {
    if (!isAPIError(error)) return 500;
    const status: unknown = (error as { statusCode?: unknown }).statusCode;
    if (typeof status !== "number" || !Number.isFinite(status)) return 500;
    return status >= 500 ? status : null;
}

/**
 * Better Auth's `onAPIError`, telling the host about server faults only.
 *
 * Better Auth answers `/api/auth/*` itself, so a failure there never reaches
 * the host's own error handling. `onAPIError.onError` is the one place its
 * router hands over every value thrown while answering a request (an
 * endpoint, a middleware, a hook, a plugin, the adapter), whatever the
 * status. Setting it replaces Better Auth's own logging of those errors, so
 * the host's reporter is what writes the log line.
 *
 * Whatever the host's function throws is swallowed: reporting can't fail a
 * sign-in. Better Auth's logger then says only that reporting failed.
 */
export function serverErrorHook(
    onServerError: OnAuthServerError,
): NonNullable<BetterAuthOptions["onAPIError"]> {
    return {
        onError: (error, ctx) => {
            const status = serverFaultStatus(error);
            if (status === null) return;
            try {
                onServerError({ error, status });
            } catch {
                try {
                    ctx.logger.error("A server error could not be reported");
                } catch {
                    // Nothing left to tell.
                }
            }
        },
    };
}

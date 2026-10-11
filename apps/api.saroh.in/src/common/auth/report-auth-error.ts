import { routeTemplate } from "@saroh/error-tracking";

import { getRequestContext } from "../logging/request-context";
import { structuredLogger } from "../logging/structured-logger";
import { reportError } from "../observability/report-error";

/**
 * A server error inside Better Auth, handed to the API's error reporter.
 *
 * Better Auth answers `/api/auth/*` itself, outside Nest, so
 * `AllExceptionsFilter` never sees a failure there: sign-in, sign-up,
 * password reset, email verification and session reads would fail unseen.
 * `@saroh/auth` calls this from Better Auth's own error hook, for a 5xx
 * only. A wrong password, an unverified email, a rate limit and a failed
 * validation are outcomes, and are never reported.
 *
 * What is reported: the error (scrubbed by the reporter), the status, the
 * method, the route's shape and the request's id. Never a body, a header, a
 * cookie, a query string, an email, a password or a token.
 */

/** Segments that are followed by a secret in Better Auth's own routes. */
const TOKEN_AFTER = new Set(["reset-password"]);

/**
 * An auth path reduced to its route:
 * `/api/auth/reset-password/<token>?callbackURL=…` → `/api/auth/reset-password/:token`.
 * The token is replaced by where it sits, not by what it looks like; any
 * other id-like segment is replaced by the shared `routeTemplate`.
 */
export function authRouteTemplate(path: string): string {
    const segments = (path.split(/[?#]/u)[0] ?? "").split("/");
    const kept = segments.map((segment, index) => {
        const before = segments[index - 1];
        return segment && before && TOKEN_AFTER.has(before)
            ? ":token"
            : segment;
    });
    return routeTemplate(kept.join("/"));
}

export function reportAuthServerError(fault: {
    error: unknown;
    status: number;
}): void {
    try {
        // Set by `correlationIdMiddleware`, which runs before Better Auth's
        // handler: the hook itself is not handed the request.
        const request = getRequestContext();
        const route = request?.path
            ? authRouteTemplate(request.path)
            : undefined;
        reportError(fault.error, {
            correlationId: request?.correlationId ?? "unknown",
            statusCode: fault.status,
            ...(request?.method ? { method: request.method } : {}),
            // The route's shape for the log line's path too: the path asked
            // for may hold a reset token. No headers at all.
            ...(route ? { url: route, route } : {}),
        });
    } catch {
        // The reporter must never throw into a sign-in.
        try {
            structuredLogger.warn("auth_error_report_failed", {});
        } catch {
            // Nothing left to tell.
        }
    }
}

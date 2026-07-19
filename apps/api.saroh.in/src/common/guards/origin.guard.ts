import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { ForbiddenException, Injectable } from "@nestjs/common";
import { isTrustedOrigin } from "@saroh/auth";

/**
 * App-layer CSRF origin check (Blocker B3 / R-10).
 *
 * CORS is browser-enforced only — it stops a browser from READING a
 * cross-origin response, but never stops the server from PROCESSING a forged
 * state-changing request. Better Auth already checks trusted origins on its own
 * `/api/auth/*` routes; this guard extends that same defense to every
 * authenticated business route as defense-in-depth on top of the SameSite
 * session cookie (a cross-site POST never carries that cookie in the first
 * place).
 *
 * Policy, applied only to UNSAFE methods (POST/PUT/PATCH/DELETE):
 *  - A PRESENT `Origin` (or, absent that, `Referer`) that is NOT a trusted
 *    `*.saroh.in` origin is REJECTED (403). This is the actual browser-CSRF
 *    vector — a real browser always sends `Origin` on a cross-site POST.
 *  - A MISSING Origin AND Referer is ALLOWED. Server-to-server callers (the
 *    frontends' own server-side `fetch` to the API forward the session cookie
 *    but no Origin header) legitimately omit it; the SameSite cookie is the
 *    backstop for the browser case. Requiring an Origin here would break every
 *    server action, so it is intentionally permitted.
 *  - PUBLIC endpoints (`/public/*`, `/health`) and Better Auth's own
 *    `/api/auth/*` are EXEMPT: public intake (enquiry, analytics, provider
 *    webhooks) is deliberately cross-origin from customer sites / providers and
 *    carries no session cookie, so there is nothing to forge.
 */
@Injectable()
export class OriginGuard implements CanActivate {
    /** Methods that can mutate state and are therefore CSRF-relevant. */
    private static readonly UNSAFE = new Set([
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
    ]);

    /** Path prefixes that are intentionally cross-origin / not cookie-authed. */
    private static readonly EXEMPT_PREFIXES = [
        "/public/",
        "/api/auth/",
        "/health",
    ];

    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<{
            method?: string;
            path?: string;
            originalUrl?: string;
            url?: string;
            headers: Record<string, string | string[] | undefined>;
        }>();

        const method = (req.method ?? "GET").toUpperCase();
        if (!OriginGuard.UNSAFE.has(method)) return true;

        const path = this.pathOf(req);
        if (OriginGuard.EXEMPT_PREFIXES.some((p) => path.startsWith(p))) {
            return true;
        }

        // Prefer Origin; fall back to Referer. Missing both → server-to-server,
        // allowed (SameSite cookie is the backstop for browsers).
        const candidate =
            this.header(req.headers.origin) ?? this.header(req.headers.referer);
        if (candidate !== undefined && !isTrustedOrigin(candidate)) {
            throw new ForbiddenException("Untrusted request origin");
        }
        return true;
    }

    /** The request path without the query string. */
    private pathOf(req: {
        path?: string;
        originalUrl?: string;
        url?: string;
    }): string {
        const raw = req.path ?? req.originalUrl ?? req.url ?? "/";
        const q = raw.indexOf("?");
        return q === -1 ? raw : raw.slice(0, q);
    }

    /** First value of a possibly-array header, or undefined when absent/empty. */
    private header(value: string | string[] | undefined): string | undefined {
        const v = Array.isArray(value) ? value[0] : value;
        return v && v.trim() !== "" ? v : undefined;
    }
}

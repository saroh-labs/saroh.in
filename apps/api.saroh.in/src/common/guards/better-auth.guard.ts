import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    HttpException,
    HttpStatus,
    Injectable,
    UnauthorizedException,
} from "@nestjs/common";
import { getTrustedOrigins } from "@saroh/auth";
import { fromNodeHeaders } from "better-auth/node";
import type { Response } from "express";
import type { IncomingHttpHeaders } from "node:http";

import { env } from "../../env";
import type { WindowLimiter } from "../../modules/rate-limits/shared-window";
import { SharedRateLimiter } from "../../modules/rate-limits/shared-window";
import { auth } from "../auth/auth";
import { getRequestContext } from "../logging/request-context";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type SessionResult = NonNullable<
    Awaited<ReturnType<typeof auth.api.getSession>>
>;

interface AuthenticatedRequest {
    method: string;
    headers: IncomingHttpHeaders;
    user?: SessionResult["user"];
    session?: SessionResult["session"];
}

/**
 * Validates the incoming Better Auth session by reading it directly from the
 * shared Postgres (no network hop to accounts). Attaches the session user to
 * the request for downstream guards/handlers.
 *
 * Because auth is now cookie-based (the browser auto-attaches the .saroh.in
 * cookie), state-changing requests are forgeable cross-site. CORS does not
 * stop the request reaching the handler, so we reject mutating requests whose
 * Origin/Referer is not a trusted *.saroh.in origin.
 */
@Injectable()
export class BetterAuthGuard implements CanActivate {
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context
            .switchToHttp()
            .getRequest<AuthenticatedRequest>();

        if (MUTATING_METHODS.has(request.method)) {
            const originHeader =
                request.headers.origin ?? request.headers.referer;
            const origin =
                typeof originHeader === "string" ? originHeader : undefined;
            if (origin && !isTrustedOrigin(origin)) {
                throw new ForbiddenException("Untrusted request origin");
            }
        }

        const result = await auth.api.getSession({
            headers: fromNodeHeaders(request.headers),
        });

        if (!result?.session) {
            throw new UnauthorizedException("Invalid or expired session");
        }

        request.user = result.user;
        request.session = result.session;
        const requestContext = getRequestContext();
        if (requestContext) requestContext.sessionId = result.session.id;
        await this.limitMember(context, result.user.id);
        return true;
    }

    /**
     * A generous per-person ceiling on the signed-in API (04-F9): a script
     * holding a session cookie could load the API without limit, while the
     * same reads through an API key were capped. Shared across replicas in
     * Redis; `MEMBER_REQUESTS_PER_MINUTE` sets it, 0 turns it off.
     */
    private async limitMember(
        context: ExecutionContext,
        userId: string,
    ): Promise<void> {
        if (!this.limiter || (await this.limiter.take(userId))) return;
        const wait = await this.limiter.retryAfterSeconds(userId);
        context
            .switchToHttp()
            .getResponse<Response>()
            .setHeader("Retry-After", String(wait));
        throw new HttpException(
            "Too many requests. Wait a moment, then try again.",
            HttpStatus.TOO_MANY_REQUESTS,
        );
    }

    /** Replaced in specs; null when the limit is off. */
    limiter: WindowLimiter | null = memberLimiter();
}

/** Requests a minute for one signed-in person, unset. */
export const DEFAULT_MEMBER_REQUESTS_PER_MINUTE = 1200;

let shared: SharedRateLimiter | null | undefined;

function memberLimiter(): SharedRateLimiter | null {
    if (shared === undefined) {
        const raw = env.MEMBER_REQUESTS_PER_MINUTE;
        const cap =
            raw === undefined
                ? DEFAULT_MEMBER_REQUESTS_PER_MINUTE
                : Number(raw);
        shared =
            cap > 0
                ? new SharedRateLimiter("member-requests", cap, 60_000)
                : null;
    }
    return shared;
}

function isTrustedOrigin(origin: string): boolean {
    let candidate: string;
    try {
        candidate = new URL(origin).origin;
    } catch {
        return false;
    }
    return getTrustedOrigins().some((trusted) => {
        try {
            return new URL(trusted).origin === candidate;
        } catch {
            return false;
        }
    });
}

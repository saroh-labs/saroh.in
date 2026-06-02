import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    UnauthorizedException,
} from "@nestjs/common";
import { getTrustedOrigins } from "@saroh/auth";
import { fromNodeHeaders } from "better-auth/node";

import { auth } from "../auth/auth";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

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
        const request = context.switchToHttp().getRequest();

        if (MUTATING_METHODS.has(request.method)) {
            const origin: string | undefined =
                request.headers.origin ?? request.headers.referer;
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
        return true;
    }
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

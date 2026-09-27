import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Injectable, UnauthorizedException } from "@nestjs/common";

import type { CustomerRequest } from "./customer-context.decorator";
import { SessionsService } from "./sessions.service";
import { resolveSiteHost } from "./site-host";
import type { SiteRelay } from "./site-relay";
import { SITE_RELAY_HEADER, verifySiteRelay } from "./site-relay";
import { siteRelaySecret } from "./site-secrets";

/** The header the site's server forwards the session token in. */
export const CUSTOMER_SESSION_HEADER = "x-customer-session";

/**
 * Lets a request through only for a customer signed in on the site that
 * relayed it (ADR-011; round-2 plan A, A3).
 *
 * 1. The signed relay must check (401 otherwise): customer routes are
 *    server-to-server, from the site's own server.
 * 2. The relayed host resolves to its published site and business (404
 *    when there is none).
 * 3. The token in `x-customer-session` must be a live session of an ACTIVE
 *    account on that very site (401 otherwise).
 *
 * Then `request.customerContext` is set, and `OrgRlsInterceptor` runs the
 * handler in that business's RLS context. The guard never reads a cookie:
 * a workspace (Better Auth) session signs nobody in on a site, and
 * `BetterAuthGuard` never reads `x-customer-session`.
 */
@Injectable()
export class CustomerSessionGuard implements CanActivate {
    constructor(private readonly sessions: SessionsService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context
            .switchToHttp()
            .getRequest<CustomerRequest & { siteRelay?: SiteRelay }>();
        const relay = verifySiteRelay(
            request.headers[SITE_RELAY_HEADER],
            siteRelaySecret(),
        );
        if (!relay) {
            throw new UnauthorizedException(
                "This request must come from the business's website.",
            );
        }
        request.siteRelay = relay;

        const raw = request.headers[CUSTOMER_SESSION_HEADER];
        const token = Array.isArray(raw) ? raw[0] : raw;
        if (!token) throw signedOut();

        const site = await resolveSiteHost(relay.host);
        const customer = await this.sessions.resolve(token, site);
        if (!customer) throw signedOut();
        request.customerContext = customer;
        return true;
    }
}

function signedOut(): UnauthorizedException {
    return new UnauthorizedException({
        message: "Sign in to continue.",
        details: { reason: "signed-out" },
    });
}

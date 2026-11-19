import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { ForbiddenException, Injectable } from "@nestjs/common";

import { fromAccounts } from "../accounts-origins";

/**
 * On a route that sends a code (owner, 18 Nov): the request's `Origin`, or
 * `Referer` without one, must be an accounts site (`accountsOrigins`), not
 * merely any Saroh origin as `OriginGuard` asks. Neither header is a 403
 * too. Nothing first-party calls these from a server: the accounts app
 * calls them from the browser.
 *
 * A cheap filter, not authentication: a script can set any header. It
 * turns away the lazy ones before Turnstile and the limits are asked.
 */
@Injectable()
export class AccountsOriginGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const { headers } = context.switchToHttp().getRequest<{
            headers: Record<string, string | string[] | undefined>;
        }>();
        const first = (name: string) => {
            const value = headers[name];
            return Array.isArray(value) ? value[0] : value;
        };
        if (
            !fromAccounts(
                { origin: first("origin"), referer: first("referer") },
                first("host"),
            )
        ) {
            throw new ForbiddenException(
                "Codes are sent from Saroh's sign-in only.",
            );
        }
        return true;
    }
}

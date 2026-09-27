import type { ExecutionContext } from "@nestjs/common";
import { createParamDecorator, UnauthorizedException } from "@nestjs/common";

/**
 * Who a customer route is serving (ADR-011; round-2 plan A, A3): a
 * business's own customer, signed in on that business's site.
 *
 * `CustomerSessionGuard` sets it as `request.customerContext`, never as
 * `request.organizationContext`: a customer is not a member, and no staff
 * permission check may mistake one for the other. `OrgRlsInterceptor` reads
 * its `organizationId`, so every query on a customer route runs in that
 * business's row-level security context.
 */
export interface CustomerContext {
    organizationId: string;
    siteId: string;
    accountId: string;
    contactId: string;
    /** The session this request came in on (sign out revokes it). */
    sessionId: string;
}

export interface CustomerRequest {
    headers: Record<string, string | string[] | undefined>;
    customerContext?: CustomerContext;
}

/** The customer {@link CustomerSessionGuard} signed in. */
export const CurrentCustomer = createParamDecorator(
    (_: unknown, context: ExecutionContext): CustomerContext => {
        const customer = context
            .switchToHttp()
            .getRequest<CustomerRequest>().customerContext;
        if (!customer) {
            // Only reachable when a route forgets the guard.
            throw new UnauthorizedException("Sign in to continue.");
        }
        return customer;
    },
);

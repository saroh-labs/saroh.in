import {
    Controller,
    Delete,
    Get,
    Header,
    HttpCode,
    HttpStatus,
    UseGuards,
} from "@nestjs/common";

import type { CustomerContext } from "./customer-context.decorator";
import { CurrentCustomer } from "./customer-context.decorator";
import { CustomerSessionGuard } from "./customer-session.guard";
import type { SignedInCustomer } from "./sessions.service";
import { SessionsService } from "./sessions.service";

/**
 * The signed-in customer's own session on a business's site (ADR-011;
 * round-2 plan A, A3), mounted at `/public/site-accounts/session`.
 *
 * Every route is behind {@link CustomerSessionGuard}: the site's signed
 * relay plus a live session for that very site. The site's server calls
 * these; a browser never does.
 */
@Controller("public/site-accounts")
@UseGuards(CustomerSessionGuard)
export class SessionsController {
    constructor(private readonly sessions: SessionsService) {}

    /** Who is signed in: the account's email and the contact's name only. */
    @Get("session")
    @Header("Cache-Control", "no-store")
    current(
        @CurrentCustomer() customer: CustomerContext,
    ): Promise<SignedInCustomer> {
        return this.sessions.describe(customer);
    }

    /** Sign out of this session. */
    @Delete("session")
    @HttpCode(HttpStatus.NO_CONTENT)
    async signOut(@CurrentCustomer() customer: CustomerContext): Promise<void> {
        await this.sessions.revoke(customer);
    }

    /** Sign out everywhere: every session of the account. */
    @Delete("sessions")
    @Header("Cache-Control", "no-store")
    signOutEverywhere(
        @CurrentCustomer() customer: CustomerContext,
    ): Promise<{ revoked: number }> {
        return this.sessions.revokeAll(customer);
    }
}

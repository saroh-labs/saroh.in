import {
    Body,
    Controller,
    Get,
    Header,
    HttpCode,
    HttpStatus,
    Post,
    UseGuards,
} from "@nestjs/common";

import { RequestCodeDto, VerifyCodeDto } from "./dto";
import type {
    CodeRequested,
    SessionIssued,
    SignInOptions,
} from "./sign-in-codes.service";
import { SignInCodesService } from "./sign-in-codes.service";
import type { SiteRelay } from "./site-relay";
import { RelayContext, SiteRelayGuard } from "./site-relay";

/**
 * A customer signing in on a business's own site with an emailed code
 * (ADR-011; round-2 plan A, A2), mounted at `/public/site-accounts`.
 *
 * Server-to-server only: every route needs the signed `x-saroh-relay` from
 * the site's server (401 without it), which names the host the visitor was
 * on and their address. The business comes from that host, never from the
 * body, and a body with any field but the ones below is a 400.
 *
 * There is no Better Auth here and no organization guard: a customer is
 * not a user (ADR-011).
 */
@Controller("public/site-accounts")
@UseGuards(SiteRelayGuard)
export class SignInController {
    constructor(private readonly codes: SignInCodesService) {}

    /**
     * What the sign-in sheet needs up front: whether a challenge is likely,
     * the widget's public key, and the business's phone for the "couldn't
     * send" line. Every published site takes sign-in; there is no switch.
     */
    @Get("options")
    @Header("Cache-Control", "no-store")
    options(@RelayContext() relay: SiteRelay): Promise<SignInOptions> {
        return this.codes.options(relay);
    }

    /**
     * Send a code to an email. 202 with the same body whether or not the
     * email has an account. 429 `limit` is the visitor's own limit, 429
     * `wait` a shared one (at most 10 minutes), 400 `challenge` asks for the
     * bot challenge, 503 `unavailable` means the email couldn't be sent.
     */
    @Post("codes")
    @HttpCode(HttpStatus.ACCEPTED)
    @Header("Cache-Control", "no-store")
    requestCode(
        @RelayContext() relay: SiteRelay,
        @Body() dto: RequestCodeDto,
    ): Promise<CodeRequested> {
        return this.codes.requestCode(relay, dto);
    }

    /**
     * Trade a code for a session. The token is in this answer once and
     * stored only as its hash; the site's server puts it in the cookie.
     */
    @Post("sessions")
    @HttpCode(HttpStatus.CREATED)
    @Header("Cache-Control", "no-store")
    verify(
        @RelayContext() relay: SiteRelay,
        @Body() dto: VerifyCodeDto,
    ): Promise<SessionIssued> {
        return this.codes.verifyCode(relay, dto);
    }
}

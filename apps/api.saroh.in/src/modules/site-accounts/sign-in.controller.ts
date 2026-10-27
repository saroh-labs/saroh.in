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

import {
    RequestCodeDto,
    RequestPhoneCodeDto,
    VerifyCodeDto,
    VerifyPhoneCodeDto,
} from "./dto";
import type { PhoneNeedsEmail } from "./phone-sign-in.service";
import { PhoneSignInService } from "./phone-sign-in.service";
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
    constructor(
        private readonly codes: SignInCodesService,
        private readonly phone: PhoneSignInService,
    ) {}

    /**
     * What the sign-in sheet needs up front: whether a challenge is likely,
     * the widget's public key, and the business's phone for the "couldn't
     * send" line. Every published site takes sign-in; there is no switch.
     * `whatsapp` offers the WhatsApp code (DEC-196): only while the business
     * has it on and its balance covers a code.
     */
    @Get("options")
    @Header("Cache-Control", "no-store")
    async options(
        @RelayContext() relay: SiteRelay,
    ): Promise<SignInOptions & { whatsapp: boolean }> {
        const [options, whatsapp] = await Promise.all([
            this.codes.options(relay),
            this.phone.offered(relay),
        ]);
        return { ...options, whatsapp };
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

    /**
     * Send a sign-in code by WhatsApp (DEC-196). 202 with the same body for
     * every number. 400 `challenge` asks for the bot challenge (every code
     * needs it), 400 for a number that isn't an Indian mobile, 422 for one
     * not on WhatsApp, 429 `limit`|`wait`, 503 `unavailable`.
     */
    @Post("phone-codes")
    @HttpCode(HttpStatus.ACCEPTED)
    @Header("Cache-Control", "no-store")
    requestPhoneCode(
        @RelayContext() relay: SiteRelay,
        @Body() dto: RequestPhoneCodeDto,
    ): Promise<CodeRequested> {
        return this.phone.requestCode(relay, dto);
    }

    /**
     * Trade a WhatsApp code for a session, or, for a phone no account holds,
     * `{ emailNeeded, phoneProof }`: the email code that follows takes the
     * proof and adds the phone. 400 invalid|expired as for email codes.
     */
    @Post("phone-sessions")
    @HttpCode(HttpStatus.CREATED)
    @Header("Cache-Control", "no-store")
    verifyPhone(
        @RelayContext() relay: SiteRelay,
        @Body() dto: VerifyPhoneCodeDto,
    ): Promise<SessionIssued | PhoneNeedsEmail> {
        return this.phone.verifyCode(relay, dto);
    }
}

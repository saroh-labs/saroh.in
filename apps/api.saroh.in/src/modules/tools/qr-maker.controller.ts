import {
    Body,
    Controller,
    HttpCode,
    HttpException,
    HttpStatus,
    Post,
    UseGuards,
} from "@nestjs/common";

import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import type { SiteRelay } from "../site-accounts/site-relay";
import { RelayContext, SiteRelayGuard } from "../site-accounts/site-relay";
import { UnlockQrMakerDto } from "./dto";
import type { QrMakerUnlock } from "./qr-maker-gate.service";
import { QrMakerGateService } from "./qr-maker-gate.service";

/**
 * PUBLIC: the QR code maker's email gate (QR codes plan U9), what
 * saroh.in's `/api/qr-code-maker/unlock` forwards to, server to server. No
 * account: a stranger uses the tool before one exists. Only saroh.in's
 * server may call it — {@link SiteRelayGuard} refuses (401) a request
 * without a valid signed `x-saroh-relay` — so nobody can call the API
 * directly to skip the site, or pick the address their limits count.
 *
 * The code itself is drawn and downloaded in the visitor's browser; this
 * route takes an email and nothing else. The limits count the relayed
 * visitor, per process: 5 a minute (the link preview unlock's) and 30 an
 * hour. The emails' own caps are durable, in the gate.
 */
@Controller("public/tools/qr-code-maker")
@UseGuards(SiteRelayGuard)
export class QrMakerController {
    private readonly perMinute = new FixedWindowRateLimiter(5, 60_000);
    private readonly perHour = new FixedWindowRateLimiter(30, 60 * 60_000);

    constructor(private readonly gate: QrMakerGateService) {}

    /** Unlock the downloads with an email. */
    @Post("unlock")
    @HttpCode(HttpStatus.OK)
    async unlock(
        @Body() dto: UnlockQrMakerDto,
        @RelayContext() relay: SiteRelay,
    ): Promise<QrMakerUnlock> {
        const key = relay.clientHash;
        if (!(this.perMinute.take(key) && this.perHour.take(key))) {
            throw new HttpException(
                "Too many requests from this address. Try again in a few minutes.",
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
        return this.gate.unlock({ email: dto.email, ipHash: key });
    }
}

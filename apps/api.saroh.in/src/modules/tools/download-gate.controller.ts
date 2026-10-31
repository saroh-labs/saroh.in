import {
    Body,
    Controller,
    ForbiddenException,
    Get,
    HttpCode,
    HttpException,
    HttpStatus,
    Logger,
    NotFoundException,
    Post,
    UseGuards,
} from "@nestjs/common";

import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import { ChallengeVerifier } from "../site-accounts/challenge";
import type { SiteRelay } from "../site-accounts/site-relay";
import { RelayContext, SiteRelayGuard } from "../site-accounts/site-relay";
import type { DownloadUnlock } from "./download-gate.service";
import { DownloadGateService, downloadContact } from "./download-gate.service";
import { DOWNLOAD_SLUGS } from "./download-names";
import { DownloadUnlockDto } from "./dto";

const TOO_MANY = "Too many requests. Try again in a few minutes.";
let challengeWarnedAt = 0;

/**
 * PUBLIC: saroh.in's free downloads' gate (plan 2026-10-31-002 U9), what
 * saroh.in's `/api/downloads/unlock` forwards to, server to server, behind
 * the signed visitor relay ({@link SiteRelayGuard}) as the tools' gate is.
 *
 * Everything that can refuse runs before anything is written: the
 * visitor's limits (5 a minute, 30 an hour), the download's slug (404 when
 * it isn't ours), the contact (400 naming the field), the contact's limit
 * (5 a minute), then Turnstile (403 `challenge`). The limits are per
 * process, like the tools'.
 */
@Controller("public/downloads")
@UseGuards(SiteRelayGuard)
export class DownloadGateController {
    private readonly logger = new Logger(DownloadGateController.name);
    private readonly perMinute = new FixedWindowRateLimiter(5, 60_000);
    private readonly perHour = new FixedWindowRateLimiter(30, 60 * 60_000);
    private readonly perContact = new FixedWindowRateLimiter(5, 60_000);

    constructor(
        private readonly gate: DownloadGateService,
        private readonly challenge: ChallengeVerifier,
    ) {}

    /** The public Turnstile key the gate draws its check with, or null when none is asked. */
    @Get("options")
    options(): { turnstileSiteKey: string | null } {
        return { turnstileSiteKey: this.challenge.siteKey };
    }

    /** Give a download for an email or a WhatsApp number. */
    @Post("unlock")
    @HttpCode(HttpStatus.OK)
    async unlock(
        @Body() dto: DownloadUnlockDto,
        @RelayContext() relay: SiteRelay,
    ): Promise<DownloadUnlock> {
        const ip = relay.clientHash;
        if (!(this.perMinute.take(ip) && this.perHour.take(ip))) {
            throw new HttpException(TOO_MANY, HttpStatus.TOO_MANY_REQUESTS);
        }
        if (!DOWNLOAD_SLUGS.includes(dto.slug)) {
            throw new NotFoundException("That isn't one of our downloads.");
        }
        const contact = downloadContact(dto);
        if (!this.perContact.take(contact.key)) {
            throw new HttpException(TOO_MANY, HttpStatus.TOO_MANY_REQUESTS);
        }
        if (!(await this.challenged(dto.turnstileToken, relay.address))) {
            throw new ForbiddenException({
                message: "The check didn't pass. Try again.",
                details: { reason: "challenge" },
            });
        }
        return this.gate.unlock({ slug: dto.slug, contact, ipHash: ip });
    }

    /** Turnstile when it is set up; without it the gate stays open and says so, once an hour. */
    private async challenged(
        token: string | undefined,
        address: string,
    ): Promise<boolean> {
        if (this.challenge.configured) {
            return this.challenge.verify(token, address);
        }
        if (Date.now() - challengeWarnedAt > 3_600_000) {
            challengeWarnedAt = Date.now();
            this.logger.error(
                "download_challenge_not_configured: downloads are given with no bot check; set TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY",
            );
        }
        return true;
    }
}

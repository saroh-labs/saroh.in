import {
    Body,
    Controller,
    Headers,
    HttpCode,
    HttpException,
    HttpStatus,
    Ip,
    Post,
} from "@nestjs/common";

import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import { SITE_RELAY_HEADER, visitorKey } from "../site-accounts/site-relay";
import { BusinessReportsService } from "./business-reports.service";
import { SubmitBusinessReportDto } from "./dto";

/**
 * PUBLIC business reports, mounted at `/public/business-reports` with NO
 * guards — what saroh.in's `/api/business-reports` forwards to from the
 * /customers page, as `/api/waitlist` forwards a join. Write-only: there is
 * no GET here, and the answer never says whether the address was a Saroh
 * site. Refused on a test release (`test-host-routes.spec.ts`).
 */
@Controller("public/business-reports")
export class PublicBusinessReportsController {
    /**
     * Per-visitor speed bumps, the waitlist's in-process limiter: a cheap
     * brake on someone flooding the staff's list, not a guarantee.
     */
    private readonly perMinute = new FixedWindowRateLimiter(3, 60_000);
    private readonly perDay = new FixedWindowRateLimiter(20, 24 * 60 * 60_000);

    constructor(private readonly reports: BusinessReportsService) {}

    /**
     * The limit counts the visitor saroh.in's server signs into
     * `x-saroh-relay`, else the caller; the raw IP is hashed here and only
     * the digest goes on.
     */
    @Post()
    @HttpCode(HttpStatus.OK)
    async submit(
        @Body() dto: SubmitBusinessReportDto,
        @Ip() ip: string,
        @Headers(SITE_RELAY_HEADER) relay: string | undefined,
    ): Promise<{ ok: true }> {
        const ipHash = visitorKey(ip, relay);
        if (
            ipHash &&
            !(this.perMinute.take(ipHash) && this.perDay.take(ipHash))
        ) {
            throw new HttpException(
                "Too many reports from this address. Try again later.",
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
        return this.reports.submit({
            site: dto.site,
            message: dto.message,
            email: dto.email,
            ipHash,
        });
    }
}

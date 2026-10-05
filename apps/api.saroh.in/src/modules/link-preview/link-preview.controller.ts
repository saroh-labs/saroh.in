import {
    Body,
    Controller,
    Get,
    Headers,
    HttpCode,
    HttpException,
    HttpStatus,
    Ip,
    Post,
    Query,
} from "@nestjs/common";

import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import { SITE_RELAY_HEADER, visitorKey } from "../site-accounts/site-relay";
import { CheckLinkQueryDto, UnlockReportDto } from "./dto";
import type { LinkCheck, LinkFailure } from "./link-preview.service";
import { LinkPreviewService } from "./link-preview.service";
import type { AppKey, LinkFacts, TagRow } from "./link-report";
import { scoreLine } from "./link-report";
import type { UnlockResult } from "./link-report-gate.service";
import { LinkReportGateService } from "./link-report-gate.service";

/** What the page gets for a check: the facts and the verdicts, not the fixes (they're unlocked). */
export type LinkCheckView =
    | {
          ok: true;
          url: string;
          checkedAt: string;
          facts: LinkFacts;
          apps: { app: AppKey; ok: boolean }[];
          right: number;
          fixCount: number;
          score: string;
          tags: TagRow[];
      }
    | {
          ok: false;
          url: string;
          checkedAt: string;
          failure: LinkFailure;
          status?: number;
      };

export function checkView(check: LinkCheck): LinkCheckView {
    if (!check.ok) return check;
    const { report } = check;
    return {
        ok: true,
        url: check.url,
        checkedAt: check.checkedAt,
        facts: check.facts,
        apps: report.apps,
        right: report.right,
        fixCount: report.fixes.length,
        score: scoreLine(report),
        tags: report.tags,
    };
}

/**
 * PUBLIC link preview tool (resources plan U2, KTD-3), what saroh.in's
 * `/api/link-preview` forwards to, server to server with the signed
 * visitor relay. No guards: a stranger uses it before any account exists.
 *
 * Both limits count the visitor (`visitorKey`: the relayed address when
 * the relay checks, else the caller), per process, like the waitlist's.
 * A check fetches someone else's site, so it is limited by the minute and
 * by the hour; a cached answer counts too, or the cache would be a way
 * round the limit.
 */
@Controller("public/tools/link-preview")
export class LinkPreviewController {
    private readonly perMinute = new FixedWindowRateLimiter(10, 60_000);
    private readonly perHour = new FixedWindowRateLimiter(60, 60 * 60_000);
    private readonly unlocks = new FixedWindowRateLimiter(5, 60_000);

    constructor(
        private readonly preview: LinkPreviewService,
        private readonly gate: LinkReportGateService,
    ) {}

    @Get()
    async check(
        @Query() query: CheckLinkQueryDto,
        @Ip() ip: string,
        @Headers(SITE_RELAY_HEADER) relay: string | undefined,
    ): Promise<LinkCheckView> {
        const key = visitorKey(ip, relay);
        if (key && !(this.perMinute.take(key) && this.perHour.take(key))) {
            throw new HttpException(
                "Too many checks from this address. Try again in a minute.",
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
        return checkView(await this.preview.check(query.url));
    }

    /** Unlock the fix-it report with an email (KTD-5). */
    @Post("report")
    @HttpCode(HttpStatus.OK)
    async unlock(
        @Body() dto: UnlockReportDto,
        @Ip() ip: string,
        @Headers(SITE_RELAY_HEADER) relay: string | undefined,
    ): Promise<UnlockResult> {
        const key = visitorKey(ip, relay);
        if (key && !this.unlocks.take(key)) {
            throw new HttpException(
                "Too many requests from this address. Try again in a minute.",
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
        return this.gate.unlock({
            email: dto.email,
            url: dto.url,
            consent: dto.consent,
            ipHash: key,
        });
    }
}

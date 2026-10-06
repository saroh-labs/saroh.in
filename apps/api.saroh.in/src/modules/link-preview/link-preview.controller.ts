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
import { CheckLinkDto, UnlockReportDto } from "./dto";
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
          sample?: true;
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
        ...(check.sample && { sample: true as const }),
    };
}

/**
 * PUBLIC link preview tool (resources plan U2, KTD-3), what saroh.in's
 * `/api/link-preview` forwards to, server to server. No account: a
 * stranger uses it before one exists. But only saroh.in's server may call
 * it — {@link SiteRelayGuard} refuses (401) a request without a valid
 * signed `x-saroh-relay` — so nobody can call the API directly to skip the
 * site, or pick the address their limits count.
 *
 * Both routes are POSTs with the address in the JSON body: a request line
 * is logged (and lands in error reports and the host's log), a body is not,
 * and the address someone checked is theirs.
 *
 * The limits count the relayed visitor, per process. A check fetches
 * someone else's site, so it is limited by the minute and by the hour; a
 * cached answer counts too, or the cache would be a way round the limit.
 * An unlock checks the address again, so it takes a check as well as one
 * of its own.
 */
@Controller("public/tools/link-preview")
@UseGuards(SiteRelayGuard)
export class LinkPreviewController {
    private readonly perMinute = new FixedWindowRateLimiter(10, 60_000);
    private readonly perHour = new FixedWindowRateLimiter(60, 60 * 60_000);
    private readonly unlocks = new FixedWindowRateLimiter(5, 60_000);

    constructor(
        private readonly preview: LinkPreviewService,
        private readonly gate: LinkReportGateService,
    ) {}

    private takeCheck(key: string): void {
        if (!(this.perMinute.take(key) && this.perHour.take(key))) {
            throw new HttpException(
                "Too many checks from this address. Try again in a minute.",
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
    }

    @Post()
    @HttpCode(HttpStatus.OK)
    async check(
        @Body() dto: CheckLinkDto,
        @RelayContext() relay: SiteRelay,
    ): Promise<LinkCheckView> {
        this.takeCheck(relay.clientHash);
        return checkView(
            await this.preview.check(dto.url, { fresh: dto.fresh === true }),
        );
    }

    /** Unlock the fix-it report with an email (KTD-5). */
    @Post("report")
    @HttpCode(HttpStatus.OK)
    async unlock(
        @Body() dto: UnlockReportDto,
        @RelayContext() relay: SiteRelay,
    ): Promise<UnlockResult> {
        const key = relay.clientHash;
        if (!this.unlocks.take(key)) {
            throw new HttpException(
                "Too many requests from this address. Try again in a minute.",
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
        this.takeCheck(key);
        return this.gate.unlock({
            email: dto.email,
            url: dto.url,
            ipHash: key,
        });
    }
}

import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Ip,
    Param,
    Post,
    Query,
    UseGuards,
} from "@nestjs/common";
import type { AnalyticsDailyAggregate } from "@saroh/database";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import { PublicSiteOnlineGuard } from "../../common/guards/public-site-online.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import {
    IgnoreModuleReadiness,
    RequireModule,
} from "../capabilities/require-module.decorator";
import type { IngestResult } from "./analytics.service";
import { AnalyticsService } from "./analytics.service";
import {
    CreateSiteLinkDto,
    IngestAnalyticsEventDto,
    InsightsPeriodQueryDto,
    InsightsSourcesQueryDto,
} from "./dto";
import type { MoneyRead } from "./money";
import { DEFAULT_PERIOD } from "./period";
import type { SellsRead } from "./sells";
import { SellsService } from "./sells.service";
import type { SiteLinksRead, SiteLinkView } from "./site-links.service";
import { SiteLinksService } from "./site-links.service";
import type { SourcesRead } from "./sources";
import { SourcesService } from "./sources.service";
import type { SuggestionsRead } from "./suggestions";
import type { NotNowResult } from "./suggestions.service";
import { SuggestionsService } from "./suggestions.service";
import { TakingsService } from "./takings.service";

/**
 * PUBLIC analytics intake (S7-002), mounted at `/public/sites` with NO guards —
 * this is what an anonymous visitor's beacon POSTs to. Deliberately no
 * `BetterAuthGuard`/`OrganizationGuard` and no `@OrgContext()`: no session, no
 * client-supplied org.
 *
 * The owning org is derived entirely from the `:siteId` Site row inside
 * {@link AnalyticsService.ingestPublic}, so this unauthenticated endpoint can
 * only ever write events for the org that owns the targeted site. The source IP
 * (from `@Ip()`) is handed to the service, which salts it into a coarse hash and
 * discards it — the raw IP never lands in the ledger.
 */
@Controller("public/sites")
@UseGuards(PublicSiteOnlineGuard)
export class AnalyticsPublicController {
    constructor(private readonly analytics: AnalyticsService) {}

    @Post(":siteId/analytics/events")
    @HttpCode(202)
    ingest(
        @Param("siteId") siteId: string,
        @Body() dto: IngestAnalyticsEventDto,
        @Ip() ip: string,
    ): Promise<IngestResult> {
        return this.analytics.ingestPublic(
            siteId,
            {
                type: dto.type,
                schemaVersion: dto.schemaVersion,
                properties: dto.properties,
                consent: dto.consent,
                dedupeKey: dto.dedupeKey,
                occurredAt: dto.occurredAt,
            },
            ip || undefined,
        );
    }
}

/**
 * Org analytics dashboard reads (S7-002), scoped to
 * `/organizations/:organizationId/analytics`.
 *
 * Double-guarded (`BetterAuthGuard` + `OrganizationGuard`); handlers receive
 * only a proven {@link OrganizationContext} via `@OrgContext()`. Reads require
 * `analytics:read` (OWNER/ADMIN-only), enforced in the service. The read is over
 * pre-computed daily aggregates, always filtered by the proven org id.
 *
 * Both reads answer once Insights is on, set up or not (DEC-075): Insights'
 * readiness waits for activity, and a business with no sales and no visits
 * yet is told so on the page — no takings is an answer, not a setup step.
 */
@Controller("organizations/:organizationId/analytics")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("INSIGHTS")
@IgnoreModuleReadiness()
export class AnalyticsController {
    constructor(
        private readonly analytics: AnalyticsService,
        private readonly takings: TakingsService,
        private readonly sells: SellsService,
        private readonly sources: SourcesService,
        private readonly suggestions: SuggestionsService,
        private readonly links: SiteLinksService,
    ) {}

    /**
     * Insights' Money for one period (DEC-171, `money.ts`): money in against
     * the same number of days before, the usual order, twelve weekly bars
     * marked by window, this week and today so far, places with their
     * change, and who owes by how late. `?period=7d|4w|3m`, 4 weeks when
     * absent. Needs `payment:read` beside `analytics:read`.
     */
    @Get("money")
    getMoney(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: InsightsPeriodQueryDto,
    ): Promise<MoneyRead> {
        return this.takings.money(ctx, query.period ?? DEFAULT_PERIOD);
    }

    /**
     * Insights' What sells for one period (DEC-171, `sells.ts`): best
     * sellers, booked most and how full, the busiest days and times, and
     * the best customers. `?period=7d|4w|3m`, 4 weeks when absent. Needs
     * `analytics:read`; amounts only with `payment:read` and customers'
     * names only with `contact:read`.
     */
    @Get("sells")
    getSells(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: InsightsPeriodQueryDto,
    ): Promise<SellsRead> {
        return this.sells.read(ctx, query.period ?? DEFAULT_PERIOD);
    }

    /**
     * Insights' sources and the path from visit to paid for one period
     * (DEC-171, plan U16, #1101, `sources.ts`): visited, looked, started
     * and paid, each at most the one before; visits and paid by source,
     * small sources folded into Other sites; the merchant's own links; and
     * the day counting began. `?period=7d|4w|3m`, 4 weeks when absent;
     * `?siteId=` narrows all four steps to one website (paid is the
     * visit's own `site.paid` step, DEC-181). Needs `analytics:read`;
     * counts only, no money.
     */
    @Get("sources")
    getSources(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: InsightsSourcesQueryDto,
    ): Promise<SourcesRead> {
        return this.sources.read(
            ctx,
            query.period ?? DEFAULT_PERIOD,
            query.siteId ?? null,
        );
    }

    /**
     * The business's own links (DEC-181, #1099), live and newest first,
     * each with its visits and paid in the period: `?period=7d|4w|3m`,
     * `?siteId=` for one website. Only these labels are counted as
     * themselves. Needs `analytics:read`.
     */
    @Get("links")
    getLinks(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: InsightsSourcesQueryDto,
    ): Promise<SiteLinksRead> {
        return this.links.list(
            ctx,
            query.period ?? DEFAULT_PERIOD,
            query.siteId ?? null,
        );
    }

    /**
     * Make a link from a name, with the label shown and maybe changed.
     * Needs `site:update`; written to Activity.
     */
    @Post("links")
    makeLink(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: CreateSiteLinkDto,
    ): Promise<SiteLinkView> {
        return this.links.create(ctx, dto);
    }

    /** Archive a link; its past figures stay. `site:update`; to Activity. */
    @Post("links/:linkId/archive")
    @HttpCode(200)
    archiveLink(
        @OrgContext() ctx: OrganizationContext,
        @Param("linkId") linkId: string,
    ): Promise<SiteLinkView> {
        return this.links.archive(ctx, linkId);
    }

    /** Undo Archive: the link counts again. `site:update`; to Activity. */
    @Post("links/:linkId/restore")
    @HttpCode(200)
    restoreLink(
        @OrgContext() ctx: OrganizationContext,
        @Param("linkId") linkId: string,
    ): Promise<SiteLinkView> {
        return this.links.restore(ctx, linkId);
    }

    /**
     * Insights' suggestions for the person asking (DEC-171,
     * `suggestions.ts`): a class nearly always full, a bill more than 3
     * weeks late, something selling less, ranked, less what they put off
     * with Not now; the first-sale suggestion before any sale.
     * `?period=7d|4w|3m` is what selling less compares, 4 weeks when
     * absent. Needs `analytics:read`; the money rules need `payment:read`.
     */
    @Get("suggestions")
    getSuggestions(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: InsightsPeriodQueryDto,
    ): Promise<SuggestionsRead> {
        return this.suggestions.read(ctx, query.period ?? DEFAULT_PERIOD);
    }

    /** Not now: hide one suggestion from this person for 7 days. */
    @Post("suggestions/:key/not-now")
    @HttpCode(200)
    notNow(
        @OrgContext() ctx: OrganizationContext,
        @Param("key") key: string,
    ): Promise<NotNowResult> {
        return this.suggestions.notNow(ctx, key);
    }

    /** Undo Not now: the suggestion shows again at once. */
    @Delete("suggestions/:key/not-now")
    @HttpCode(204)
    undoNotNow(
        @OrgContext() ctx: OrganizationContext,
        @Param("key") key: string,
    ): Promise<void> {
        return this.suggestions.undoNotNow(ctx, key);
    }

    @Get()
    getDashboard(
        @OrgContext() ctx: OrganizationContext,
        @Query("siteId") siteId?: string,
        @Query("type") type?: string,
        @Query("from") from?: string,
        @Query("to") to?: string,
    ): Promise<AnalyticsDailyAggregate[]> {
        return this.analytics.getDashboard(ctx, {
            siteId,
            type,
            from: from ? new Date(from) : undefined,
            to: to ? new Date(to) : undefined,
        });
    }
}

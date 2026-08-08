import {
    Body,
    Controller,
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
import type { OrganizationContext } from "../../common/types/organization-context";
import type { IngestResult } from "./analytics.service";
import { AnalyticsService } from "./analytics.service";
import { IngestAnalyticsEventDto } from "./dto";

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
 */
@Controller("organizations/:organizationId/analytics")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class AnalyticsController {
    constructor(private readonly analytics: AnalyticsService) {}

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

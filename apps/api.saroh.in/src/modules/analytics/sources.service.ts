import { Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { businessTimezone } from "../bookings/staff-availability";
import { authorize } from "../organizations/organization-policy";
import type { InsightsPeriod } from "./period";
import { periodWindows } from "./period";
import type { SourcesRead } from "./sources";
import { shapeSources } from "./sources";
import { readVisitSources } from "./visit-sources";

/**
 * Insights' sources and the path from visit to paid for one period
 * (DEC-171, plan U16, #1101; `sources.ts`), for the active organization
 * only. Runs on a request, so the org-RLS interceptor has already put it in
 * the business's context (`runInOrgContext`); every query names the
 * business as well.
 *
 * Who may read it: Insights' own `analytics:read`. It holds counts, never
 * money, so `payment:read` is not asked for.
 */
@Injectable()
export class SourcesService {
    async read(
        ctx: OrganizationContext,
        period: InsightsPeriod,
        siteId: string | null = null,
        now: Date = new Date(),
    ): Promise<SourcesRead> {
        authorize(ctx, "analytics:read");
        const organizationId = ctx.organizationId;
        const zone = await businessTimezone(prisma, organizationId);
        const w = periodWindows(period, now, zone);
        // The rollups are kept by day: the period's first and last days.
        const read = await readVisitSources(prisma, organizationId, {
            from: new Date(`${w.fromDate}T00:00:00Z`),
            to: new Date(`${w.toDate}T00:00:00Z`),
            ...(siteId ? { siteId } : {}),
        });
        return shapeSources(read, {
            period,
            days: w.days,
            from: w.fromDate,
            to: w.toDate,
            siteId,
        });
    }
}

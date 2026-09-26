import { Injectable } from "@nestjs/common";
import type { OrganizationMergeReport } from "@saroh/database";
import { MERGE_REPORT_ACTION, prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";

/** One run's report, as the merge wrote it, and when. */
export interface MergeReportView {
    id: string;
    at: Date;
    merged: OrganizationMergeReport["merged"];
    keptApart: OrganizationMergeReport["keptApart"];
    discarded: OrganizationMergeReport["discarded"];
}

/**
 * What the same-product merge (#530, `packages/database/src/backfill/
 * merge-same-products.ts`) did to this business's catalogue: which products
 * became one, which share a name but were kept apart and why, and every
 * value a merge dropped.
 *
 * The merge writes each report once into the audit stream and leaves a
 * notice in the inbox pointing here. Both are Owner/Admin reads: the report
 * is read with `audit:read`, like Settings › Activity, and a notice with
 * `notification:read`. Newest first; a business the merge never touched
 * has none.
 */
@Injectable()
export class MergeReportService {
    async list(ctx: OrganizationContext): Promise<MergeReportView[]> {
        authorize(ctx, "audit:read");
        const events = await prisma.auditEvent.findMany({
            where: {
                organizationId: ctx.organizationId,
                action: MERGE_REPORT_ACTION,
            },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: { id: true, createdAt: true, metadata: true },
        });
        return events.map((event) => {
            const report = (event.metadata ??
                {}) as Partial<OrganizationMergeReport>;
            return {
                id: event.id,
                at: event.createdAt,
                merged: report.merged ?? [],
                keptApart: report.keptApart ?? [],
                discarded: report.discarded ?? [],
            };
        });
    }
}

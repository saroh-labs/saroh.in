import { Injectable, NotFoundException } from "@nestjs/common";
import { outsideOrgContext, prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import { AdminPermission } from "./admin-permissions";

const PAGE_SIZE = 50;

export type BusinessReportStatusFilter = "open" | "done" | "all";

export interface BusinessReportRow {
    id: string;
    siteHost: string;
    message: string;
    status: "OPEN" | "DONE";
    createdAt: Date;
    doneAt: Date | null;
    /** The business the address resolved to, or null when it isn't a Saroh site. */
    business: { id: string; name: string } | null;
    /** Whether the reporter left an email at all. */
    hasEmail: boolean;
    /** The email itself, only for staff with `organization:pii:read`. */
    reporterEmail: string | null;
}

export interface BusinessReportPage {
    items: BusinessReportRow[];
    open: number;
    nextCursor?: string;
}

/**
 * Customers' reports about a business (saroh.in/customers; Terms rev 46).
 * CROSS-TENANT READ: every report, about every business, outside any
 * organization context — behind `organization:read`. It returns what decides
 * whether to act: the address, the business it resolved to and the
 * customer's words. The reporter's email is personal data and comes back
 * only to staff holding `organization:pii:read`; others see that one was
 * left. Closing a report needs `reports:resolve` (Support and Platform
 * Owners) and is audited.
 */
@Injectable()
export class AdminBusinessReportsService {
    constructor(private readonly audit: AdminAuditService) {}

    async list(
        staff: PlatformAdminInfo,
        query: { status?: BusinessReportStatusFilter; cursor?: string },
    ): Promise<BusinessReportPage> {
        const status = query.status ?? "open";
        const where =
            status === "all"
                ? {}
                : ({ status: status === "done" ? "DONE" : "OPEN" } as const);
        const seesEmail = staff.permissions.includes(
            AdminPermission.OrganizationPiiRead,
        );
        const [rows, open] = await outsideOrgContext(() =>
            Promise.all([
                prisma.businessReport.findMany({
                    where,
                    select: {
                        id: true,
                        siteHost: true,
                        message: true,
                        status: true,
                        createdAt: true,
                        doneAt: true,
                        reporterEmail: true,
                        organization: { select: { id: true, name: true } },
                    },
                    ...(query.cursor
                        ? { cursor: { id: query.cursor }, skip: 1 }
                        : {}),
                    take: PAGE_SIZE + 1,
                    // Newest first.
                    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                }),
                prisma.businessReport.count({ where: { status: "OPEN" } }),
            ]),
        );
        const hasMore = rows.length > PAGE_SIZE;
        const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
        return {
            items: page.map(({ reporterEmail, organization, ...row }) => ({
                ...row,
                business: organization,
                hasEmail: reporterEmail !== null,
                reporterEmail: seesEmail ? reporterEmail : null,
            })),
            open,
            nextCursor: hasMore ? page[page.length - 1]?.id : undefined,
        };
    }

    /**
     * Mark a report done: someone has looked at it and acted, or decided
     * nothing needs doing. Audited with the reason; marking a done report
     * done again changes nothing and is not audited twice.
     */
    async markDone(
        staff: PlatformAdminInfo,
        id: string,
        reason: string,
    ): Promise<{ id: string; status: "DONE" }> {
        return outsideOrgContext(() =>
            prisma.$transaction(async (tx) => {
                const report = await tx.businessReport.findUnique({
                    where: { id },
                    select: { status: true, organizationId: true },
                });
                if (!report) throw new NotFoundException("No such report");
                if (report.status === "DONE") return { id, status: "DONE" };
                await tx.businessReport.update({
                    where: { id },
                    data: { status: "DONE", doneAt: new Date() },
                });
                await this.audit.write(tx, {
                    actorUserId: staff.userId,
                    permission: AdminPermission.ReportsResolve,
                    action: "business-report.done",
                    targetType: "business-report",
                    targetId: id,
                    organizationId: report.organizationId ?? undefined,
                    reason: reason.trim(),
                    outcome: AdminAuditOutcome.Success,
                });
                return { id, status: "DONE" as const };
            }),
        );
    }
}

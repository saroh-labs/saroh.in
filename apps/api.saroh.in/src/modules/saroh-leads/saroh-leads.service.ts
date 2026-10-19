import { ForbiddenException, Injectable } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { istDay } from "../admin/admin-billing";
import { AdminPermission } from "../admin/admin-permissions";
import { ownerWhere, scopeForStaff } from "../admin/staff-scope";
import {
    activeAccountManager,
    candidatesFor,
    contactsOf,
    maySeeAll,
    ownerFilter,
    ownerName,
    searchFilter,
    visibleLead,
} from "./lead-access";
import type { LeadStage } from "./lead-rules";
import { calendarDay, LEAD_STAGES, OPEN_STAGES } from "./lead-rules";
import type {
    LeadContact,
    LeadDetail,
    LeadsBoard,
    LeadsBoardQuery,
} from "./lead-views";
import { LEAD_SELECT, leadCard, leadDetail } from "./lead-views";

/** The most cards one board read returns, newest stage change first. */
const BOARD_LIMIT = 500;

/**
 * Saroh's own sales leads (DEC-169, admin console U20), read: the board, a
 * lead with its calls and visits, the businesses Won may name, and who a
 * lead may be given to. The writes are `SarohLeadWritesService`.
 *
 * CROSS-TENANT, Saroh's own data: a lead belongs to no business, and these
 * reads run with no organization context. Every read goes through
 * `scopeForStaff`: an Account manager sees only the leads they own
 * (another's is a 403), and only staff with every lead in scope (Support,
 * Platform owner) see unowned leads.
 */
@Injectable()
export class SarohLeadsService {
    /** The board: every lead this staff member may see, by stage. */
    async board(
        staff: PlatformAdminInfo,
        query: LeadsBoardQuery = {},
    ): Promise<LeadsBoard> {
        const scope = scopeForStaff(staff, AdminPermission.SarohLeadsRead);
        const today = istDay(new Date());
        const where: Prisma.SarohLeadWhereInput = {
            ...ownerWhere(scope, "ownerPlatformAdminId"),
            ...ownerFilter(scope, query.owner),
            ...searchFilter(query.q),
        };
        const [rows, byStage, overdue, unowned] = await Promise.all([
            prisma.sarohLead.findMany({
                where,
                select: LEAD_SELECT,
                orderBy: [{ stagedAt: "desc" }, { id: "desc" }],
                take: BOARD_LIMIT + 1,
            }),
            prisma.sarohLead.groupBy({
                by: ["stage"],
                where,
                _count: { _all: true },
            }),
            prisma.sarohLead.count({
                where: {
                    ...where,
                    stage: { in: [...OPEN_STAGES] },
                    followUpOn: { lt: calendarDay(today) },
                },
            }),
            scope.kind === "all"
                ? prisma.sarohLead.count({
                      where: {
                          ownerPlatformAdminId: null,
                          stage: { in: [...OPEN_STAGES] },
                      },
                  })
                : Promise.resolve(null),
        ]);
        const counts = Object.fromEntries(
            LEAD_STAGES.map((stage) => [stage, 0]),
        ) as Record<LeadStage, number>;
        for (const row of byStage) {
            counts[row.stage as LeadStage] = row._count._all;
        }
        return {
            scope: scope.kind,
            today,
            leads: rows
                .slice(0, BOARD_LIMIT)
                .map((row) => leadCard(row, today)),
            truncated: rows.length > BOARD_LIMIT,
            counts,
            overdue,
            unowned,
            mayAssign: scope.kind === "all" && maySeeAll(staff),
        };
    }

    /** One lead with its calls and visits. Another manager's is a 403. */
    async detail(
        staff: PlatformAdminInfo,
        leadId: string,
    ): Promise<LeadDetail> {
        const scope = scopeForStaff(staff, AdminPermission.SarohLeadsRead);
        const lead = await visibleLead(prisma, scope, leadId);
        const [log, won] = await Promise.all([
            contactsOf(prisma, lead.id),
            lead.wonOrganizationId
                ? prisma.organization.findUnique({
                      where: { id: lead.wonOrganizationId },
                      select: { id: true, name: true },
                  })
                : Promise.resolve(null),
        ]);
        return leadDetail(lead, istDay(new Date()), {
            log,
            wonOrganization: won,
            mayAssign:
                scope.kind === "all" &&
                maySeeAll(staff) &&
                lead.ownerPlatformAdminId === null,
            mayWrite: staff.permissions.includes(
                AdminPermission.SarohLeadsWrite,
            ),
        });
    }

    /** A lead's calls and visits, newest first. Another manager's is a 403. */
    async log(
        staff: PlatformAdminInfo,
        leadId: string,
    ): Promise<LeadContact[]> {
        const scope = scopeForStaff(staff, AdminPermission.SarohLeadsRead);
        const lead = await visibleLead(prisma, scope, leadId);
        return contactsOf(prisma, lead.id);
    }

    /**
     * The businesses this lead may have become: those owned by someone
     * signed in with the lead's email or its sign-up email. What Won offers,
     * so an Account manager never searches every business.
     */
    async wonCandidates(
        staff: PlatformAdminInfo,
        leadId: string,
    ): Promise<{ id: string; name: string }[]> {
        const scope = scopeForStaff(staff, AdminPermission.SarohLeadsRead);
        const lead = await visibleLead(prisma, scope, leadId);
        return candidatesFor(prisma, lead);
    }

    /**
     * Who a lead may be given to: everyone holding the Account manager role
     * now. Only for staff who give leads out.
     */
    async managers(
        staff: PlatformAdminInfo,
    ): Promise<{ platformAdminId: string; name: string; openLeads: number }[]> {
        const scope = scopeForStaff(staff, AdminPermission.SarohLeadsWrite);
        if (scope.kind !== "all" || !maySeeAll(staff)) {
            throw new ForbiddenException(
                "Only Support or a Platform owner gives out leads.",
            );
        }
        const now = new Date();
        const admins = await prisma.platformAdmin.findMany({
            where: {
                revokedAt: null,
                roleAssignments: {
                    some: activeAccountManager(now),
                },
            },
            select: {
                id: true,
                user: { select: { name: true } },
                _count: {
                    select: {
                        sarohLeads: {
                            where: { stage: { in: [...OPEN_STAGES] } },
                        },
                    },
                },
            },
        });
        return admins
            .map((admin) => ({
                platformAdminId: admin.id,
                name: ownerName(admin),
                openLeads: admin._count.sarohLeads,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }
}

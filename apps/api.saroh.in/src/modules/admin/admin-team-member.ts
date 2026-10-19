import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { outsideOrgContext, prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import type { LinkKind, LinkSource } from "../organizations/account-manager";
import type { ContactKind } from "../saroh-leads/lead-rules";
import { OPEN_STAGES } from "../saroh-leads/lead-rules";
import type { LeadCard } from "../saroh-leads/lead-views";
import { LEAD_SELECT, leadCard, teammateName } from "../saroh-leads/lead-views";
import { istDay } from "./admin-billing";
import type { AdminRole } from "./admin-permissions";
import { AdminPermission, isAdminRole } from "./admin-permissions";
import { scopeForStaff } from "./staff-scope";

/**
 * A teammate's own page on the console's Team (DEC-169, admin console U22,
 * R33): who they are, the businesses they look after and how each came
 * in, the leads they work, and what they did lately. The profile itself is
 * `AdminStaffService.getProfile`'s, so the tax id rule stays in one place.
 *
 * Who may read it: anyone holding `team:read`, and every teammate their
 * own page. An Account manager holds no `team:read`, so another's page is
 * a 403 (decided here, before anything is read, so a wrong id says nothing
 * about who exists).
 */

/** How many of each kind of row the page reads. */
const BUSINESS_LIMIT = 200;
const LEAD_LIMIT = 100;
const ACTIVITY_LIMIT = 60;

export type MemberAccess = "team" | "self";

/**
 * May this staff member open `platformAdminId`'s page? `team` with
 * `team:read`, `self` on their own; anything else is refused.
 */
export function memberAccess(
    staff: Pick<PlatformAdminInfo, "permissions" | "platformAdminId">,
    platformAdminId: string,
): MemberAccess {
    if (staff.permissions.includes(AdminPermission.TeamRead)) return "team";
    if (staff.platformAdminId && staff.platformAdminId === platformAdminId) {
        return "self";
    }
    throw new ForbiddenException("You can open only your own page.");
}

export interface MemberBusiness {
    organizationId: string;
    name: string;
    slug: string;
    /** How it came to them: LINK, CODE, LEAD_EMAIL or ASSIGNED. */
    source: LinkSource;
    kind: LinkKind;
    since: Date;
}

export type MemberActivity =
    | {
          id: string;
          type: "contact";
          at: Date;
          kind: ContactKind;
          minutes: number | null;
          /** What was said; null when the reader may not see it. */
          summary: string | null;
          with:
              | { type: "lead"; id: string; name: string | null }
              | { type: "business"; id: string; name: string }
              | null;
      }
    | {
          id: string;
          type: "role-given" | "role-ended";
          at: Date;
          role: AdminRole;
          /** When it was given to end, for role-given. */
          expiresAt: Date | null;
      }
    | {
          id: string;
          type: "business-started" | "business-ended";
          at: Date;
          organizationId: string;
          name: string;
          source: LinkSource;
      };

export interface TeamMemberRead {
    platformAdminId: string;
    userId: string;
    name: string | null;
    email: string;
    grantedAt: Date;
    revokedAt: Date | null;
    note: string | null;
    /** Their console roles now, with when each ends. */
    roles: { role: AdminRole; expiresAt: Date | null; assignedAt: Date }[];
    reportsTo: { platformAdminId: string; name: string } | null;
    businesses: MemberBusiness[];
    /** Their open leads; null when the reader may not see leads. */
    leads: LeadCard[] | null;
    counts: {
        businesses: number;
        broughtIn: number;
        openLeads: number;
        overdueFollowUps: number;
        wonThisMonth: number;
    };
    activity: MemberActivity[];
}

/**
 * Whether the reader sees this teammate's leads and what their calls said:
 * on their own page with `saroh-leads:read`, or anyone for whom that
 * permission is unscoped (Support, Platform owner). Billing and Auditor
 * see counts and when, never a lead's name or a call's words.
 */
export function seesLeadWork(
    staff: PlatformAdminInfo,
    platformAdminId: string,
): boolean {
    if (!staff.permissions.includes(AdminPermission.SarohLeadsRead)) {
        return false;
    }
    const scope = scopeForStaff(staff, AdminPermission.SarohLeadsRead);
    return scope.kind === "all" || scope.platformAdminId === platformAdminId;
}

/** The first moment of this month in India, as a UTC instant. */
export function istMonthStart(now: Date): Date {
    return new Date(`${istDay(now).slice(0, 7)}-01T00:00:00+05:30`);
}

/** Read the page's facts. The caller has checked access. */
export async function readTeamMember(input: {
    staff: PlatformAdminInfo;
    platformAdminId: string;
    reportsToPlatformAdminId: string | null;
    now?: Date;
}): Promise<TeamMemberRead> {
    const now = input.now ?? new Date();
    const id = input.platformAdminId;
    const leadWork = seesLeadWork(input.staff, id);
    const today = istDay(now);
    const open = { in: [...OPEN_STAGES] };

    return outsideOrgContext(async () => {
        const admin = await prisma.platformAdmin.findUnique({
            where: { id },
            select: {
                id: true,
                userId: true,
                grantedAt: true,
                revokedAt: true,
                note: true,
                user: { select: { email: true, name: true } },
                roleAssignments: {
                    select: {
                        id: true,
                        role: true,
                        assignedAt: true,
                        expiresAt: true,
                        revokedAt: true,
                    },
                    orderBy: { assignedAt: "desc" },
                    take: ACTIVITY_LIMIT,
                },
            },
        });
        if (!admin) throw new NotFoundException("Staff member not found");

        const [reportsTo, links, leads, counts, contacts] = await Promise.all([
            input.reportsToPlatformAdminId
                ? prisma.platformAdmin.findUnique({
                      where: { id: input.reportsToPlatformAdminId },
                      select: { id: true, user: { select: { name: true } } },
                  })
                : null,
            prisma.accountManagerLink.findMany({
                where: { platformAdminId: id },
                select: {
                    id: true,
                    organizationId: true,
                    source: true,
                    kind: true,
                    startedAt: true,
                    endedAt: true,
                    organization: { select: { name: true, slug: true } },
                },
                orderBy: { startedAt: "desc" },
                take: BUSINESS_LIMIT,
            }),
            leadWork
                ? prisma.sarohLead.findMany({
                      where: { ownerPlatformAdminId: id, stage: open },
                      select: LEAD_SELECT,
                      orderBy: [
                          { followUpOn: { sort: "asc", nulls: "last" } },
                          { createdAt: "asc" },
                      ],
                      take: LEAD_LIMIT,
                  })
                : null,
            Promise.all([
                prisma.sarohLead.count({
                    where: { ownerPlatformAdminId: id, stage: open },
                }),
                prisma.sarohLead.count({
                    where: {
                        ownerPlatformAdminId: id,
                        stage: open,
                        followUpOn: { lt: new Date(`${today}T00:00:00.000Z`) },
                    },
                }),
                prisma.sarohLead.count({
                    where: {
                        ownerPlatformAdminId: id,
                        stage: "WON",
                        wonAt: { gte: istMonthStart(now) },
                    },
                }),
            ]),
            prisma.sarohContactLog.findMany({
                where: { platformAdminId: id },
                select: {
                    id: true,
                    kind: true,
                    happenedAt: true,
                    minutes: true,
                    summary: true,
                    leadId: true,
                    organizationId: true,
                    lead: { select: { name: true } },
                    organization: { select: { name: true } },
                },
                orderBy: [{ happenedAt: "desc" }, { id: "desc" }],
                take: ACTIVITY_LIMIT,
            }),
        ]);

        const businesses: MemberBusiness[] = links
            .filter((link) => link.endedAt === null)
            .map((link) => ({
                organizationId: link.organizationId,
                name: link.organization.name,
                slug: link.organization.slug,
                source: link.source as LinkSource,
                kind: link.kind as LinkKind,
                since: link.startedAt,
            }));

        const activity: MemberActivity[] = [
            ...contacts.map((row): MemberActivity => ({
                id: `contact:${row.id}`,
                type: "contact",
                at: row.happenedAt,
                kind: row.kind as ContactKind,
                minutes: row.minutes,
                summary: leadWork ? row.summary : null,
                with: row.leadId
                    ? {
                          type: "lead",
                          id: row.leadId,
                          name: leadWork ? (row.lead?.name ?? null) : null,
                      }
                    : row.organizationId && row.organization
                      ? {
                            type: "business",
                            id: row.organizationId,
                            name: row.organization.name,
                        }
                      : null,
            })),
            ...admin.roleAssignments.flatMap((row): MemberActivity[] => {
                if (!isAdminRole(row.role)) return [];
                const given: MemberActivity = {
                    id: `role:${row.id}`,
                    type: "role-given",
                    at: row.assignedAt,
                    role: row.role,
                    expiresAt: row.expiresAt,
                };
                return row.revokedAt
                    ? [
                          given,
                          {
                              id: `role-end:${row.id}`,
                              type: "role-ended",
                              at: row.revokedAt,
                              role: row.role,
                              expiresAt: null,
                          },
                      ]
                    : [given];
            }),
            ...links.flatMap((link): MemberActivity[] => {
                const base = {
                    organizationId: link.organizationId,
                    name: link.organization.name,
                    source: link.source as LinkSource,
                };
                const started: MemberActivity = {
                    id: `link:${link.id}`,
                    type: "business-started",
                    at: link.startedAt,
                    ...base,
                };
                return link.endedAt
                    ? [
                          started,
                          {
                              id: `link-end:${link.id}`,
                              type: "business-ended",
                              at: link.endedAt,
                              ...base,
                          },
                      ]
                    : [started];
            }),
        ]
            .sort(
                (a, b) =>
                    b.at.getTime() - a.at.getTime() || b.id.localeCompare(a.id),
            )
            .slice(0, ACTIVITY_LIMIT);

        const [openLeads, overdueFollowUps, wonThisMonth] = counts;
        return {
            platformAdminId: admin.id,
            userId: admin.userId,
            name: admin.user.name,
            email: admin.user.email,
            grantedAt: admin.grantedAt,
            revokedAt: admin.revokedAt,
            note: admin.note,
            roles: admin.roleAssignments
                .filter(
                    (row) =>
                        row.revokedAt === null &&
                        (row.expiresAt === null || row.expiresAt > now),
                )
                .flatMap((row) =>
                    isAdminRole(row.role)
                        ? [
                              {
                                  role: row.role,
                                  expiresAt: row.expiresAt,
                                  assignedAt: row.assignedAt,
                              },
                          ]
                        : [],
                )
                .reverse(),
            reportsTo: reportsTo
                ? {
                      platformAdminId: reportsTo.id,
                      name: teammateName(reportsTo.user.name),
                  }
                : null,
            businesses,
            leads: leads ? leads.map((row) => leadCard(row, today)) : null,
            counts: {
                businesses: businesses.length,
                broughtIn: businesses.filter(
                    (business) => business.kind === "BROUGHT_IN",
                ).length,
                openLeads,
                overdueFollowUps,
                wonThisMonth,
            },
            activity,
        };
    });
}

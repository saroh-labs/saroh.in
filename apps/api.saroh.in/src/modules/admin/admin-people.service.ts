import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ORG_ACTIONS } from "../organizations/organization-actions";
import { OrganizationMembersService } from "../organizations/organization-members.service";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import { AdminPermission } from "./admin-permissions";

const SEARCH_LIMIT = 25;

export interface PersonRow {
    id: string;
    name: string | null;
    email: string;
    emailVerified: boolean;
    createdAt: Date;
    businesses: number;
    lastSeenAt: Date | null;
    isStaff: boolean;
}

export interface PersonDetail extends PersonRow {
    memberships: {
        organizationId: string;
        organizationName: string;
        organizationSlug: string;
        lifecycleStatus: string;
        role: string;
    }[];
    sessions: {
        id: string;
        createdAt: Date;
        lastActiveAt: Date;
        expiresAt: Date;
        ipAddress: string | null;
        userAgent: string | null;
    }[];
}

/**
 * People across the instance (admin console U6, R6–R8) — a CROSS-TENANT READ
 * of personal data, so every route in front of it needs
 * `organization:pii:read`, and every read is on the record.
 *
 * Changes to a person's place in a business go through the business's own
 * `OrganizationMembersService`, with an operator context: the same rules the
 * owner meets (a business always keeps an owner), the business's own audit
 * stream naming the operator, and the admin ledger saying why. The operator
 * is never disguised as one of the business's members.
 */
@Injectable()
export class AdminPeopleService {
    constructor(
        private readonly members: OrganizationMembersService,
        private readonly audit: AdminAuditService,
    ) {}

    async search(q: string): Promise<PersonRow[]> {
        const term = q.trim();
        if (term.length < 2) {
            throw new BadRequestException(
                "Search with at least two characters.",
            );
        }
        const users = await prisma.user.findMany({
            where: {
                OR: [
                    { id: term },
                    { email: { contains: term, mode: "insensitive" } },
                    { name: { contains: term, mode: "insensitive" } },
                ],
            },
            select: personSelect,
            orderBy: { email: "asc" },
            take: SEARCH_LIMIT,
        });
        return Promise.all(users.map((user) => this.row(user)));
    }

    async detail(userId: string): Promise<PersonDetail> {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                ...personSelect,
                memberships: {
                    select: {
                        role: true,
                        organization: {
                            select: {
                                id: true,
                                name: true,
                                slug: true,
                                lifecycleStatus: true,
                            },
                        },
                    },
                    orderBy: { organization: { name: "asc" } },
                },
                sessions: {
                    where: { expiresAt: { gt: new Date() } },
                    select: {
                        id: true,
                        createdAt: true,
                        updatedAt: true,
                        expiresAt: true,
                        ipAddress: true,
                        userAgent: true,
                    },
                    orderBy: { updatedAt: "desc" },
                },
            },
        });
        if (!user) throw new NotFoundException("Person not found");

        const { memberships, sessions, ...base } = user;
        return {
            ...(await this.row(base)),
            memberships: memberships.map((row) => ({
                organizationId: row.organization.id,
                organizationName: row.organization.name,
                organizationSlug: row.organization.slug,
                lifecycleStatus: row.organization.lifecycleStatus,
                role: row.role,
            })),
            sessions: sessions.map((row) => ({
                id: row.id,
                createdAt: row.createdAt,
                lastActiveAt: row.updatedAt,
                expiresAt: row.expiresAt,
                ipAddress: row.ipAddress,
                userAgent: row.userAgent,
            })),
        };
    }

    /**
     * Sign someone out everywhere, for a compromised account. Deleting the
     * session rows is what ends them: the auth layer reads the row on every
     * request, so the next one is anonymous.
     */
    async endSessions(
        staff: PlatformAdminInfo,
        userId: string,
        reason: string,
    ) {
        const why = requireReason(reason);
        return prisma.$transaction(async (tx) => {
            const user = await tx.user.findUnique({
                where: { id: userId },
                select: { id: true },
            });
            if (!user) throw new NotFoundException("Person not found");
            const ended = await tx.session.deleteMany({ where: { userId } });
            await this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.OrganizationPeopleWrite,
                action: "person.sessions.ended",
                targetType: "user",
                targetId: userId,
                reason: why,
                outcome: AdminAuditOutcome.Success,
                metadata: { sessions: ended.count },
            });
            return { ended: ended.count };
        });
    }

    async changeRole(input: {
        staff: PlatformAdminInfo;
        organizationId: string;
        userId: string;
        role: string;
        reason: string;
    }) {
        const reason = requireReason(input.reason);
        const result = await this.members.updateRole(
            operatorContext(input.staff, input.organizationId),
            input.userId,
            { role: input.role },
        );
        await this.record(input.staff, input.organizationId, {
            action: "person.role.changed",
            targetType: "membership",
            targetId: input.userId,
            reason,
            metadata: { role: input.role },
        });
        return result;
    }

    async removeMember(input: {
        staff: PlatformAdminInfo;
        organizationId: string;
        userId: string;
        reason: string;
    }) {
        const reason = requireReason(input.reason);
        const result = await this.members.remove(
            operatorContext(input.staff, input.organizationId),
            input.userId,
        );
        await this.record(input.staff, input.organizationId, {
            action: "person.removed",
            targetType: "membership",
            targetId: input.userId,
            reason,
        });
        return result;
    }

    /** Send an invitation again, with a fresh link; the old link stops working. */
    async resendInvitation(input: {
        staff: PlatformAdminInfo;
        organizationId: string;
        invitationId: string;
        reason: string;
    }) {
        const reason = requireReason(input.reason);
        const invitation = await prisma.organizationInvitation.findFirst({
            where: {
                id: input.invitationId,
                organizationId: input.organizationId,
                status: { in: ["PENDING", "EXPIRED"] },
            },
            select: { email: true, role: true, siteIds: true },
        });
        if (!invitation) {
            throw new NotFoundException("That invitation is no longer open.");
        }
        await this.members.invite(
            operatorContext(input.staff, input.organizationId),
            {
                email: invitation.email,
                role: invitation.role,
                siteIds: invitation.siteIds,
            },
        );
        await this.record(input.staff, input.organizationId, {
            action: "person.invitation.resent",
            targetType: "invitation",
            targetId: input.invitationId,
            reason,
        });
        return { resent: true };
    }

    async withdrawInvitation(input: {
        staff: PlatformAdminInfo;
        organizationId: string;
        invitationId: string;
        reason: string;
    }) {
        const reason = requireReason(input.reason);
        const result = await this.members.revokeInvitation(
            operatorContext(input.staff, input.organizationId),
            input.invitationId,
        );
        await this.record(input.staff, input.organizationId, {
            action: "person.invitation.withdrawn",
            targetType: "invitation",
            targetId: input.invitationId,
            reason,
        });
        return result;
    }

    /**
     * The admin ledger entry for a people change. The members service commits
     * the change and the business's own audit entry together; this lands just
     * after. If it cannot be written the request fails loudly, so an operator
     * never sees success for a change the admin ledger does not show.
     */
    private record(
        staff: PlatformAdminInfo,
        organizationId: string,
        entry: {
            action: string;
            targetType: string;
            targetId: string;
            reason: string;
            metadata?: Record<string, unknown>;
        },
    ) {
        return this.audit.write(prisma, {
            actorUserId: staff.userId,
            permission: AdminPermission.OrganizationPeopleWrite,
            organizationId,
            outcome: AdminAuditOutcome.Success,
            ...entry,
        });
    }

    private async row(user: PersonRecord): Promise<PersonRow> {
        const lastSession = await prisma.session.findFirst({
            where: { userId: user.id },
            select: { updatedAt: true },
            orderBy: { updatedAt: "desc" },
        });
        return {
            id: user.id,
            name: user.name,
            email: user.email,
            emailVerified: user.emailVerified,
            createdAt: user.createdAt,
            businesses: user._count.memberships,
            lastSeenAt: lastSession?.updatedAt ?? null,
            isStaff: user.platformAdmin?.revokedAt === null,
        };
    }
}

const personSelect = {
    id: true,
    name: true,
    email: true,
    emailVerified: true,
    createdAt: true,
    _count: { select: { memberships: true } },
    platformAdmin: { select: { revokedAt: true } },
} as const;

interface PersonRecord {
    id: string;
    name: string | null;
    email: string;
    emailVerified: boolean;
    createdAt: Date;
    _count: { memberships: number };
    platformAdmin: { revokedAt: Date | null } | null;
}

/**
 * The context an operator's people change runs under: every action, so the
 * business's "you cannot change a role that can do more than you" check does
 * not stop an operator; the operator's own user id, so the business's audit
 * stream names them. The business's own invariants — it always keeps an
 * owner — still apply in full.
 */
function operatorContext(
    staff: PlatformAdminInfo,
    organizationId: string,
): OrganizationContext {
    return {
        organizationId,
        userId: staff.userId,
        role: "MEMBER",
        roleKey: "platform-operator",
        actions: new Set(ORG_ACTIONS),
    };
}

function requireReason(value: string): string {
    const reason = value.trim();
    if (reason.length < 4) {
        throw new BadRequestException("Give a reason for this change.");
    }
    return reason;
}

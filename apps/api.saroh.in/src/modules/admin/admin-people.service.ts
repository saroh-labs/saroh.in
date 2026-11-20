import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import type { Edition } from "@saroh/edition";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { sendOwnerChangedNotice } from "../../common/email";
import type { OrganizationContext } from "../../common/types/organization-context";
import { PLATFORM_OPERATOR_ROLE_KEY } from "../audit/audit.service";
import { ORG_ACTIONS } from "../organizations/organization-actions";
import type { InTxLedger } from "../organizations/organization-members.service";
import { OrganizationMembersService } from "../organizations/organization-members.service";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import { peopleWhere as inEditionWhere, viaBusiness } from "./admin-edition";
import type {
    PersonHistoryItem,
    PersonRow,
    SignInState,
} from "./admin-people-reads";
import {
    peopleWhere,
    personHistory,
    personRow,
    personSelectIn,
    signInState,
} from "./admin-people-reads";
import { AdminPermission } from "./admin-permissions";
import type { PeopleFilter } from "./sign-in-help-rules";

export type { PersonRow } from "./admin-people-reads";

const OWNER = "OWNER";

/** How long an Owner change waits for a second staff member (F3). */
export const OWNER_CHANGE_TTL_MS = 24 * 60 * 60 * 1000;

const ownerRace = () =>
    new ConflictException(
        "They became an Owner a moment ago. Try again: a change to an Owner needs a second staff member.",
    );

/** Owner changes waiting for a second staff member, newest first (F3). */
export function pendingOwnerChanges(organizationId: string) {
    return prisma.ownerChangeRequest.findMany({
        where: {
            organizationId,
            confirmedAt: null,
            createdAt: { gt: new Date(Date.now() - OWNER_CHANGE_TTL_MS) },
        },
        select: {
            id: true,
            userId: true,
            kind: true,
            role: true,
            fromRole: true,
            reason: true,
            requestedByUserId: true,
            createdAt: true,
        },
        orderBy: { createdAt: "desc" },
    });
}

/** Rows the Users list shows at once, searched or not. */
export const LIST_LIMIT = 50;
/** How many accounts "Newest sign-ups" lists (owner, 9 Oct). */
export const RECENT_LIMIT = 25;

/** One account in "Newest sign-ups", with the businesses it belongs to. */
export interface RecentSignup {
    id: string;
    name: string | null;
    email: string;
    createdAt: Date;
    businesses: { id: string; name: string }[];
}

/** One page of the Users list, and whether another follows it. */
export interface PeoplePage {
    items: PersonRow[];
    /** The next page's number, when there is one. */
    nextPage?: number;
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
    /** The Sign-in tab, and why they can't sign in if anything stops them. */
    signIn: SignInState;
    /** Their businesses on the other edition: a count, never which. */
    otherEditionBusinesses: number;
    /** Businesses on Free they may own beyond their one (DEC-227). */
    extraFreeBusinesses: number;
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
    private readonly logger = new Logger(AdminPeopleService.name);

    constructor(
        private readonly members: OrganizationMembersService,
        private readonly audit: AdminAuditService,
    ) {}

    /**
     * The Users list (U9): a search, the chips, or both. With neither, the
     * newest accounts first; with a search, by email. {@link LIST_LIMIT}
     * rows a page, numbered from 1, so nobody past the 50th is out of reach.
     */
    async search(
        input: {
            q?: string;
            filters?: readonly PeopleFilter[];
            page?: number;
        } = {},
        edition: Edition | null = null,
    ): Promise<PeoplePage> {
        const term = input.q?.trim() ?? "";
        if (term.length === 1) {
            throw new BadRequestException(
                "Search with at least two characters.",
            );
        }
        const page = input.page ?? 1;
        const users = await prisma.user.findMany({
            where: {
                AND: [
                    peopleWhere(term, input.filters ?? [], undefined, edition),
                    inEditionWhere(edition),
                ],
            },
            select: personSelectIn(edition),
            orderBy: term
                ? [{ email: "asc" }]
                : [{ createdAt: "desc" }, { id: "desc" }],
            skip: (page - 1) * LIST_LIMIT,
            // One more than a page: whether a next page exists.
            take: LIST_LIMIT + 1,
        });
        const rows = users.slice(0, LIST_LIMIT);
        return {
            items: await Promise.all(rows.map((user) => personRow(user))),
            nextPage: users.length > LIST_LIMIT ? page + 1 : undefined,
        };
    }

    /** What staff did to this person (the History tab). */
    history(userId: string): Promise<PersonHistoryItem[]> {
        return personHistory(userId);
    }

    /**
     * The newest accounts on the instance, newest first: who they are and
     * which businesses they belong to. Same personal data as a search, so the
     * route in front of it needs the same permission and records each read.
     */
    async recent(edition: Edition | null = null): Promise<RecentSignup[]> {
        const users = await prisma.user.findMany({
            where: inEditionWhere(edition),
            select: {
                id: true,
                name: true,
                email: true,
                createdAt: true,
                memberships: {
                    where: viaBusiness(edition),
                    select: {
                        organization: { select: { id: true, name: true } },
                    },
                    orderBy: { organization: { name: "asc" } },
                },
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: RECENT_LIMIT,
        });
        return users.map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            createdAt: user.createdAt,
            businesses: user.memberships.map((row) => ({
                id: row.organization.id,
                name: row.organization.name,
            })),
        }));
    }

    /** Reachable on either console; the businesses shown are its edition's. */
    async detail(
        userId: string,
        edition: Edition | null = null,
    ): Promise<PersonDetail> {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                ...personSelectIn(edition),
                memberships: {
                    where: viaBusiness(edition),
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
                extraFreeBusinesses: true,
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

        const { memberships, sessions, extraFreeBusinesses, ...base } = user;
        return {
            ...(await personRow({ ...base, memberships })),
            extraFreeBusinesses,
            signIn: await signInState(base),
            otherEditionBusinesses: edition
                ? await prisma.membership.count({
                      where: {
                          userId,
                          organization: { edition: { not: edition } },
                      },
                  })
                : 0,
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

    /**
     * Let this person own more businesses on Free than their one (DEC-227):
     * `extra` beyond it, zero to take the exception away. On the ledger
     * with the reason, the old and the new number.
     */
    async setExtraFreeBusinesses(
        staff: PlatformAdminInfo,
        userId: string,
        extra: number,
        reason: string,
    ) {
        const why = requireReason(reason);
        return prisma.$transaction(async (tx) => {
            const user = await tx.user.findUnique({
                where: { id: userId },
                select: { extraFreeBusinesses: true },
            });
            if (!user) throw new NotFoundException("Person not found");
            await tx.user.update({
                where: { id: userId },
                data: { extraFreeBusinesses: extra },
            });
            await this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.OrganizationPeopleWrite,
                action: "person.free-businesses.set",
                targetType: "user",
                targetId: userId,
                reason: why,
                outcome: AdminAuditOutcome.Success,
                metadata: { from: user.extraFreeBusinesses, to: extra },
            });
            return { extraFreeBusinesses: extra };
        });
    }

    /**
     * Change someone's role. Making an Owner, or moving an Owner off the
     * role, waits for a second staff member (review F3): it is recorded as
     * a request, and `confirmOwnerChange` applies it.
     */
    async changeRole(input: {
        staff: PlatformAdminInfo;
        organizationId: string;
        userId: string;
        role: string;
        reason: string;
    }) {
        const reason = requireReason(input.reason);
        const from = await this.currentRole(input.organizationId, input.userId);
        if (input.role === OWNER || from === OWNER) {
            if (input.role === from) {
                throw new BadRequestException("They are already an Owner.");
            }
            return this.requestOwnerChange(input.staff, {
                organizationId: input.organizationId,
                userId: input.userId,
                kind: "ROLE",
                role: input.role,
                fromRole: from,
                reason,
            });
        }
        const record = this.record(input.staff, input.organizationId, {
            action: "person.role.changed",
            targetType: "membership",
            targetId: input.userId,
            reason,
            metadata: { role: input.role },
        });
        return this.members.updateRole(
            operatorContext(input.staff, input.organizationId),
            input.userId,
            { role: input.role },
            async (tx, detail) => {
                // Made an Owner since it was read: that needs two (F3).
                if (detail.from === OWNER) throw ownerRace();
                await record(tx, detail);
            },
        );
    }

    /** Remove someone; an Owner waits for a second staff member (F3). */
    async removeMember(input: {
        staff: PlatformAdminInfo;
        organizationId: string;
        userId: string;
        reason: string;
    }) {
        const reason = requireReason(input.reason);
        const from = await this.currentRole(input.organizationId, input.userId);
        if (from === OWNER) {
            return this.requestOwnerChange(input.staff, {
                organizationId: input.organizationId,
                userId: input.userId,
                kind: "REMOVE",
                role: null,
                fromRole: from,
                reason,
            });
        }
        const record = this.record(input.staff, input.organizationId, {
            action: "person.removed",
            targetType: "membership",
            targetId: input.userId,
            reason,
        });
        return this.members.remove(
            operatorContext(input.staff, input.organizationId),
            input.userId,
            async (tx, detail) => {
                if (detail.role === OWNER) throw ownerRace();
                await record(tx, detail);
            },
        );
    }

    /**
     * A second, different staff member confirms an Owner change: it applies
     * through the business's own rules, the request is marked and the
     * confirmation is on the ledger in that same transaction, and the
     * business's Owners from before the change are emailed.
     */
    async confirmOwnerChange(input: {
        staff: PlatformAdminInfo;
        organizationId: string;
        requestId: string;
        reason: string;
    }) {
        const { staff, organizationId, requestId } = input;
        const reason = requireReason(input.reason);
        const request = await prisma.ownerChangeRequest.findFirst({
            where: {
                id: requestId,
                organizationId,
                confirmedAt: null,
                createdAt: { gt: new Date(Date.now() - OWNER_CHANGE_TTL_MS) },
            },
        });
        if (!request) {
            throw new NotFoundException(
                "There is no Owner change waiting to be confirmed. It may have expired after a day.",
            );
        }
        if (request.requestedByUserId === staff.userId) {
            await this.audit.write(prisma, {
                actorUserId: staff.userId,
                permission: AdminPermission.OrganizationPeopleWrite,
                organizationId,
                action: "person.owner-change.confirmed",
                targetType: "membership",
                targetId: request.userId,
                reason,
                outcome: AdminAuditOutcome.Denied,
                metadata: { requestId, selfConfirm: true },
            });
            throw new ForbiddenException(
                "You asked for this change. A second staff member has to confirm it.",
            );
        }
        const owners = await prisma.membership.findMany({
            where: { organizationId, role: OWNER },
            select: { user: { select: { email: true } } },
        });
        const record = this.record(staff, organizationId, {
            action:
                request.kind === "REMOVE"
                    ? "person.removed"
                    : "person.role.changed",
            targetType: "membership",
            targetId: request.userId,
            reason,
            metadata: {
                ...(request.role ? { role: request.role } : {}),
                requestId,
                requestedBy: request.requestedByUserId,
                requestReason: request.reason,
            },
        });
        const confirmInTx: InTxLedger = async (tx, detail) => {
            const marked = await tx.ownerChangeRequest.updateMany({
                where: { id: requestId, confirmedAt: null },
                data: {
                    confirmedByUserId: staff.userId,
                    confirmedAt: new Date(),
                },
            });
            if (marked.count === 0) {
                throw new ConflictException(
                    "That change was confirmed a moment ago.",
                );
            }
            await record(tx, detail);
        };
        const ctx = operatorContext(staff, organizationId);
        const result =
            request.kind === "REMOVE"
                ? await this.members.remove(ctx, request.userId, confirmInTx)
                : await this.members.updateRole(
                      ctx,
                      request.userId,
                      { role: request.role ?? "" },
                      confirmInTx,
                  );
        await this.tellOwners(organizationId, request, owners);
        return result;
    }

    private async currentRole(organizationId: string, userId: string) {
        const membership = await prisma.membership.findUnique({
            where: { organizationId_userId: { organizationId, userId } },
            select: { role: true },
        });
        if (!membership) {
            throw new NotFoundException("That person isn't in this business.");
        }
        return membership.role;
    }

    private async requestOwnerChange(
        staff: PlatformAdminInfo,
        change: {
            organizationId: string;
            userId: string;
            kind: "ROLE" | "REMOVE";
            role: string | null;
            fromRole: string;
            reason: string;
        },
    ) {
        return prisma.$transaction(async (tx) => {
            const request = await tx.ownerChangeRequest.create({
                data: { ...change, requestedByUserId: staff.userId },
                select: { id: true },
            });
            await this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.OrganizationPeopleWrite,
                organizationId: change.organizationId,
                action: "person.owner-change.requested",
                targetType: "membership",
                targetId: change.userId,
                reason: change.reason,
                outcome: AdminAuditOutcome.Success,
                metadata: {
                    requestId: request.id,
                    kind: change.kind,
                    from: change.fromRole,
                    ...(change.role ? { role: change.role } : {}),
                },
            });
            return { pending: true as const, requestId: request.id };
        });
    }

    /** Best effort: the change stands and the ledger has it. */
    private async tellOwners(
        organizationId: string,
        request: { userId: string; kind: string; role: string | null },
        owners: { user: { email: string } }[],
    ) {
        try {
            const [business, person] = await Promise.all([
                prisma.organization.findUnique({
                    where: { id: organizationId },
                    select: { name: true, edition: true },
                }),
                prisma.user.findUnique({
                    where: { id: request.userId },
                    select: { name: true, email: true },
                }),
            ]);
            const change = {
                business: business?.name ?? "your business",
                person: person?.name ?? person?.email ?? "Someone",
                added: request.kind === "ROLE" && request.role === OWNER,
            };
            for (const owner of owners) {
                await sendOwnerChangedNotice(
                    owner.user.email,
                    change,
                    business?.edition ?? "INDIA",
                );
            }
        } catch (error) {
            this.logger.error(
                `The owners of ${organizationId} could not be told of an Owner change: ${
                    error instanceof Error ? error.name : "unknown error"
                }`,
            );
        }
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
            this.record(input.staff, input.organizationId, {
                action: "person.invitation.resent",
                targetType: "invitation",
                targetId: input.invitationId,
                reason,
            }),
        );
        return { resent: true };
    }

    async withdrawInvitation(input: {
        staff: PlatformAdminInfo;
        organizationId: string;
        invitationId: string;
        reason: string;
    }) {
        const reason = requireReason(input.reason);
        return this.members.revokeInvitation(
            operatorContext(input.staff, input.organizationId),
            input.invitationId,
            this.record(input.staff, input.organizationId, {
                action: "person.invitation.withdrawn",
                targetType: "invitation",
                targetId: input.invitationId,
                reason,
            }),
        );
    }

    /**
     * The admin ledger entry for a people change, written inside the members
     * service's transaction (review B3): neither commits without the other.
     * The before-value the service passes (`from`, `role`) lands in metadata.
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
    ): InTxLedger {
        return (tx, detail) =>
            this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.OrganizationPeopleWrite,
                organizationId,
                outcome: AdminAuditOutcome.Success,
                ...entry,
                metadata: { ...entry.metadata, ...detail },
            });
    }
}

/**
 * The context an operator's people change runs under: every action, so the
 * business's "you cannot change a role that can do more than you" check does
 * not stop an operator; the operator's own user id, so the change is never
 * put down to one of the business's members; and the operator role key,
 * which marks the business's audit row `byOperator` so Activity shows Saroh
 * support, never the operator (DEC-035). The business's own invariants — it
 * always keeps an owner — still apply in full.
 */
function operatorContext(
    staff: PlatformAdminInfo,
    organizationId: string,
): OrganizationContext {
    return {
        organizationId,
        userId: staff.userId,
        role: "MEMBER",
        roleKey: PLATFORM_OPERATOR_ROLE_KEY,
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

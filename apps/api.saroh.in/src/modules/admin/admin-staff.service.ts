import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import type { AdminRole } from "./admin-permissions";
import {
    AdminPermission,
    AdminRole as Roles,
    isAdminRole,
    permissionsFor,
} from "./admin-permissions";

type Tx = Prisma.TransactionClient;

export interface StaffMember {
    platformAdminId: string;
    userId: string;
    email: string;
    name: string | null;
    grantedAt: Date;
    revokedAt: Date | null;
    note: string | null;
    roles: {
        assignmentId: string;
        role: AdminRole;
        expiresAt: Date | null;
        assignedAt: Date;
        reason: string;
    }[];
    /** What those roles allow, in vocabulary order. */
    permissions: string[];
}

export interface GrantInput {
    staff: PlatformAdminInfo;
    email: string;
    roles: string[];
    reason: string;
    expiresAt?: Date;
}

/**
 * Who on the operator's team may do what (admin console U2, R1–R2).
 *
 * Grants live in the database; the vocabulary of roles and permissions does
 * not (`admin-permissions.ts`), so what a role may do is reviewable in a diff
 * and the same on every instance. Assignments are append-only: amending a
 * grant revokes the rows that change and writes new ones, so the history of
 * who could do what, and when, is never overwritten.
 *
 * One invariant is enforced here, inside the transaction, for every route: a
 * change that would leave the instance with no active Platform Owner whose
 * ownership does not expire is refused and rolled back. It is checked on the
 * outcome, not on the route, so no sequence of amend, expire and revoke can
 * get around it.
 */
@Injectable()
export class AdminStaffService {
    constructor(private readonly audit: AdminAuditService) {}

    async list(): Promise<StaffMember[]> {
        const now = new Date();
        const rows = await prisma.platformAdmin.findMany({
            select: {
                id: true,
                userId: true,
                grantedAt: true,
                revokedAt: true,
                note: true,
                user: { select: { email: true, name: true } },
                roleAssignments: {
                    where: {
                        revokedAt: null,
                        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                    },
                    select: {
                        id: true,
                        role: true,
                        expiresAt: true,
                        assignedAt: true,
                        reason: true,
                    },
                    orderBy: { assignedAt: "asc" },
                },
            },
            orderBy: [
                { revokedAt: { sort: "asc", nulls: "first" } },
                { grantedAt: "asc" },
            ],
        });

        return rows.map((row) => {
            const roles = row.roleAssignments.flatMap((assignment) =>
                isAdminRole(assignment.role)
                    ? [
                          {
                              assignmentId: assignment.id,
                              role: assignment.role,
                              expiresAt: assignment.expiresAt,
                              assignedAt: assignment.assignedAt,
                              reason: assignment.reason,
                          },
                      ]
                    : [],
            );
            return {
                platformAdminId: row.id,
                userId: row.userId,
                email: row.user.email,
                name: row.user.name,
                grantedAt: row.grantedAt,
                revokedAt: row.revokedAt,
                note: row.note,
                roles,
                permissions: row.revokedAt
                    ? []
                    : permissionsFor(roles.map((r) => r.role)),
            };
        });
    }

    /**
     * Give someone with a Saroh account staff access, or add roles to what
     * they hold. A previously revoked grant is reopened rather than duplicated.
     */
    async grant(input: GrantInput) {
        const roles = requireRoles(input.roles);
        const reason = requireReason(input.reason);
        const expiresAt = requireFuture(input.expiresAt);
        const email = input.email.trim().toLowerCase();

        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true },
        });
        if (!user) {
            throw new NotFoundException(
                "Nobody has a Saroh account with that email. Ask them to sign up first.",
            );
        }

        return this.guarded(async (tx) => {
            const now = new Date();
            const admin = await tx.platformAdmin.upsert({
                where: { userId: user.id },
                create: {
                    userId: user.id,
                    grantedByUserId: input.staff.userId,
                    note: reason,
                },
                update: {},
                select: { id: true, revokedAt: true },
            });
            if (admin.revokedAt) {
                await tx.platformAdmin.update({
                    where: { id: admin.id },
                    data: {
                        revokedAt: null,
                        grantedAt: now,
                        grantedByUserId: input.staff.userId,
                        note: reason,
                    },
                });
            }

            const held = await this.activeRoles(tx, admin.id, now);
            const added = roles.filter((role) => !held.has(role));
            if (added.length === 0 && !admin.revokedAt) {
                throw new ConflictException(
                    "They already hold every role you chose.",
                );
            }
            await tx.platformAdminRoleAssignment.createMany({
                data: added.map((role) => ({
                    platformAdminId: admin.id,
                    role,
                    assignedByUserId: input.staff.userId,
                    reason,
                    expiresAt: expiresAt ?? null,
                })),
            });

            await this.audit.write(tx, {
                actorUserId: input.staff.userId,
                permission: AdminPermission.StaffGrant,
                action: "staff.granted",
                targetType: "platform_admin",
                targetId: admin.id,
                reason,
                outcome: AdminAuditOutcome.Success,
                metadata: {
                    userId: user.id,
                    roles: added,
                    expiresAt: expiresAt?.toISOString() ?? null,
                    reopened: Boolean(admin.revokedAt),
                },
            });
            return { platformAdminId: admin.id, added };
        });
    }

    /**
     * Set exactly which roles someone holds, and until when. Roles that go
     * are revoked; roles that come are written new; a role whose expiry
     * changes is revoked and written again with the new one.
     */
    async amend(input: {
        staff: PlatformAdminInfo;
        platformAdminId: string;
        roles: string[];
        reason: string;
        expiresAt?: Date | null;
    }) {
        const roles = new Set(requireRoles(input.roles));
        const reason = requireReason(input.reason);
        const expiresAt =
            input.expiresAt === null
                ? null
                : (requireFuture(input.expiresAt) ?? null);

        return this.guarded(async (tx) => {
            const admin = await this.adminOrThrow(tx, input.platformAdminId);
            const now = new Date();
            const current = await tx.platformAdminRoleAssignment.findMany({
                where: {
                    platformAdminId: admin.id,
                    revokedAt: null,
                    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                },
                select: { id: true, role: true, expiresAt: true },
            });

            const toRevoke = current.filter(
                (row) =>
                    !roles.has(row.role as AdminRole) ||
                    !sameInstant(row.expiresAt, expiresAt),
            );
            const kept = new Set(
                current
                    .filter((row) => !toRevoke.includes(row))
                    .map((row) => row.role),
            );
            const toAdd = [...roles].filter((role) => !kept.has(role));

            if (toRevoke.length === 0 && toAdd.length === 0) {
                return { platformAdminId: admin.id, changed: false };
            }

            await tx.platformAdminRoleAssignment.updateMany({
                where: { id: { in: toRevoke.map((row) => row.id) } },
                data: { revokedAt: now },
            });
            await tx.platformAdminRoleAssignment.createMany({
                data: toAdd.map((role) => ({
                    platformAdminId: admin.id,
                    role,
                    assignedByUserId: input.staff.userId,
                    reason,
                    expiresAt,
                })),
            });

            await this.audit.write(tx, {
                actorUserId: input.staff.userId,
                permission: AdminPermission.StaffGrant,
                action: "staff.amended",
                targetType: "platform_admin",
                targetId: admin.id,
                reason,
                outcome: AdminAuditOutcome.Success,
                metadata: {
                    roles: [...roles],
                    removed: toRevoke.map((row) => row.role),
                    added: toAdd,
                    expiresAt: expiresAt?.toISOString() ?? null,
                },
            });
            return { platformAdminId: admin.id, changed: true };
        });
    }

    /**
     * Take someone's staff access away entirely. Their open support sessions
     * close with it, and the next request they make is refused.
     */
    async revoke(input: {
        staff: PlatformAdminInfo;
        platformAdminId: string;
        reason: string;
    }) {
        const reason = requireReason(input.reason);
        return this.guarded(async (tx) => {
            const admin = await this.adminOrThrow(tx, input.platformAdminId);
            if (admin.revokedAt)
                return { platformAdminId: admin.id, changed: false };
            const now = new Date();

            await tx.platformAdmin.update({
                where: { id: admin.id },
                data: { revokedAt: now },
            });
            await tx.platformAdminRoleAssignment.updateMany({
                where: { platformAdminId: admin.id, revokedAt: null },
                data: { revokedAt: now },
            });
            const closed = await tx.adminAccessSession.updateMany({
                where: { platformAdminId: admin.id, revokedAt: null },
                data: {
                    revokedAt: now,
                    revokedByUserId: input.staff.userId,
                    revocationReason: reason,
                },
            });

            await this.audit.write(tx, {
                actorUserId: input.staff.userId,
                permission: AdminPermission.StaffGrant,
                action: "staff.revoked",
                targetType: "platform_admin",
                targetId: admin.id,
                reason,
                outcome: AdminAuditOutcome.Success,
                metadata: { closedAccessSessions: closed.count },
            });
            return { platformAdminId: admin.id, changed: true };
        });
    }

    /**
     * Run a staff change and refuse it if it would take the instance from
     * having a lasting Platform Owner to having none. An instance that never
     * had one (only the break-glass allowlist) may still grant its first.
     */
    private guarded<T>(change: (tx: Tx) => Promise<T>): Promise<T> {
        return prisma.$transaction(
            async (tx) => {
                const before = await lastingOwners(tx);
                const result = await change(tx);
                const after = await lastingOwners(tx);
                if (before > 0 && after === 0) {
                    throw new ConflictException(
                        "That would leave nobody who can manage staff. Make someone else a Platform Owner first.",
                    );
                }
                return result;
            },
            { isolationLevel: "Serializable" },
        );
    }

    private async activeRoles(
        tx: Tx,
        platformAdminId: string,
        now: Date,
    ): Promise<Set<string>> {
        const rows = await tx.platformAdminRoleAssignment.findMany({
            where: {
                platformAdminId,
                revokedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            select: { role: true },
        });
        return new Set(rows.map((row) => row.role));
    }

    private async adminOrThrow(tx: Tx, platformAdminId: string) {
        const admin = await tx.platformAdmin.findUnique({
            where: { id: platformAdminId },
            select: { id: true, revokedAt: true },
        });
        if (!admin) throw new NotFoundException("Staff member not found");
        return admin;
    }
}

/**
 * Active Platform Owners whose ownership does not expire. An owner with an
 * expiry is still an owner today, but cannot be the one the instance relies
 * on — when it lapses, nobody can manage staff.
 */
async function lastingOwners(tx: Tx): Promise<number> {
    return tx.platformAdminRoleAssignment.count({
        where: {
            role: Roles.PlatformOwner,
            revokedAt: null,
            expiresAt: null,
            platformAdmin: { revokedAt: null },
        },
    });
}

function requireRoles(values: string[]): AdminRole[] {
    const roles = [...new Set(values)];
    if (roles.length === 0) {
        throw new BadRequestException("Choose at least one role.");
    }
    const unknown = roles.filter((role) => !isAdminRole(role));
    if (unknown.length > 0) {
        throw new BadRequestException(`Unknown role: ${unknown.join(", ")}`);
    }
    return roles as AdminRole[];
}

function requireReason(value: string): string {
    const reason = value.trim();
    if (reason.length < 4) {
        throw new BadRequestException("Give a reason for this change.");
    }
    return reason;
}

function requireFuture(value: Date | undefined): Date | undefined {
    if (value === undefined) return undefined;
    if (Number.isNaN(value.getTime()) || value <= new Date()) {
        throw new BadRequestException("An expiry must be in the future.");
    }
    return value;
}

function sameInstant(a: Date | null, b: Date | null): boolean {
    return (a?.getTime() ?? null) === (b?.getTime() ?? null);
}

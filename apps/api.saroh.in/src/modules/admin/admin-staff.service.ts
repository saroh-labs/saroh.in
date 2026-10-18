import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { prismaErrorCode } from "../../common/prisma-errors";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import type { AdminRole } from "./admin-permissions";
import {
    AdminPermission,
    AdminRole as Roles,
    isAdminRole,
    permissionsFor,
} from "./admin-permissions";
import type { StaffEngagement, StaffJob } from "./staff-profile";
import {
    generateManagerCode,
    normaliseTaxId,
    sealTaxId,
    taxIdLast4,
} from "./staff-profile";

type Tx = Prisma.TransactionClient;

/**
 * A teammate's profile as the console sees it (DEC-169, U18). The tax id is
 * never returned whole: `taxIdSet` says whether one is on file, and
 * `taxIdLast4` is present only for a `team:pay` holder reading it (each such
 * read is on the ledger).
 */
export interface StaffProfileView {
    platformAdminId: string;
    /** False until the first save; the other fields are then empty. */
    exists: boolean;
    worksAs: StaffJob | null;
    workEmail: string | null;
    phone: string | null;
    city: string | null;
    languages: string[];
    /** `YYYY-MM-DD`. */
    joinedOn: string | null;
    reportsToPlatformAdminId: string | null;
    engagement: StaffEngagement | null;
    capacity: number | null;
    /** Generated on the first save, never typed. */
    managerCode: string | null;
    onCommission: boolean;
    emergencyContact: string | null;
    taxIdSet: boolean;
    taxIdLast4?: string | null;
    updatedAt: Date | null;
}

export interface SaveStaffProfileInput {
    worksAs: StaffJob;
    workEmail?: string | null;
    phone?: string | null;
    city?: string | null;
    languages?: string[];
    joinedOn?: string | null;
    reportsToPlatformAdminId?: string | null;
    engagement?: StaffEngagement | null;
    capacity?: number | null;
    onCommission?: boolean;
    emergencyContact?: string | null;
    /** Absent: the tax id on file stays. Present: replaces it. */
    taxId?: string;
}

/** Tries at a fresh manager code when one clashes (31^8 codes: rare). */
const MANAGER_CODE_TRIES = 5;

const PROFILE_SELECT = {
    platformAdminId: true,
    worksAs: true,
    workEmail: true,
    phone: true,
    city: true,
    languages: true,
    joinedOn: true,
    reportsToPlatformAdminId: true,
    engagement: true,
    capacity: true,
    managerCode: true,
    onCommission: true,
    emergencyContact: true,
    taxIdCiphertext: true,
    taxIdIv: true,
    taxIdAuthTag: true,
    updatedAt: true,
} as const satisfies Prisma.StaffProfileSelect;

type ProfileRow = Prisma.StaffProfileGetPayload<{
    select: typeof PROFILE_SELECT;
}>;

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
     * A teammate's profile (`team:read`). With `team:pay` the response also
     * carries the tax id's last 4 characters, and that read is written to the
     * ledger in the same transaction, so it is never shown unrecorded.
     */
    async getProfile(input: {
        staff: PlatformAdminInfo;
        platformAdminId: string;
    }): Promise<StaffProfileView> {
        const mayPay = input.staff.permissions.includes(
            AdminPermission.TeamPay,
        );
        return prisma.$transaction(async (tx) => {
            const admin = await this.adminOrThrow(tx, input.platformAdminId);
            const row = await tx.staffProfile.findUnique({
                where: { platformAdminId: admin.id },
                select: PROFILE_SELECT,
            });
            if (!row) return emptyProfile(admin.id, mayPay);

            const view = profileView(row);
            if (!mayPay) return view;
            const sealed = sealedTaxId(row);
            if (!sealed) return { ...view, taxIdLast4: null };

            const last4 = taxIdLast4(sealed);
            await this.audit.write(tx, {
                actorUserId: input.staff.userId,
                permission: AdminPermission.TeamPay,
                action: "staff.tax-id.read",
                targetType: "platform_admin",
                targetId: admin.id,
                outcome: AdminAuditOutcome.Success,
                metadata: { shown: "last4" },
            });
            return { ...view, taxIdLast4: last4 };
        });
    }

    /**
     * Save a teammate's profile (`team:write`, with a reason). The first save
     * creates it and generates their manager code. A tax id in the save
     * replaces the one on file and needs `team:pay` too; left out, the one on
     * file stays. The change and any tax id replacement are on the ledger.
     */
    async saveProfile(input: {
        staff: PlatformAdminInfo;
        platformAdminId: string;
        profile: SaveStaffProfileInput;
        reason: string;
    }): Promise<StaffProfileView & { created: boolean }> {
        const reason = requireReason(input.reason);
        const { profile } = input;
        const mayPay = input.staff.permissions.includes(
            AdminPermission.TeamPay,
        );
        if (profile.taxId !== undefined && !mayPay) {
            throw new ForbiddenException(
                "Only Platform owner and Billing can change a tax id.",
            );
        }
        const taxId =
            profile.taxId === undefined
                ? undefined
                : normaliseTaxId(profile.taxId);
        if (taxId !== undefined && !/^[A-Z0-9-]{4,32}$/.test(taxId)) {
            throw new BadRequestException(
                "A tax id is 4 to 32 letters, digits or hyphens.",
            );
        }
        if (profile.reportsToPlatformAdminId === input.platformAdminId) {
            throw new BadRequestException("Nobody reports to themselves.");
        }
        // Sealed before the transaction: a missing key refuses the save
        // before anything is written.
        const sealed = taxId === undefined ? undefined : sealTaxId(taxId);
        const fields = {
            worksAs: profile.worksAs,
            workEmail: textOrNull(profile.workEmail)?.toLowerCase() ?? null,
            phone: textOrNull(profile.phone),
            city: textOrNull(profile.city),
            languages: [
                ...new Set(
                    (profile.languages ?? [])
                        .map((language) => language.trim())
                        .filter(Boolean),
                ),
            ],
            joinedOn: profile.joinedOn ? calendarDate(profile.joinedOn) : null,
            reportsToPlatformAdminId: profile.reportsToPlatformAdminId ?? null,
            engagement: profile.engagement ?? null,
            capacity: profile.capacity ?? null,
            onCommission: profile.onCommission ?? false,
            emergencyContact: textOrNull(profile.emergencyContact),
        };

        for (let attempt = 1; ; attempt++) {
            try {
                return await prisma.$transaction(async (tx) => {
                    const admin = await this.adminOrThrow(
                        tx,
                        input.platformAdminId,
                    );
                    if (fields.reportsToPlatformAdminId) {
                        await this.adminOrThrow(
                            tx,
                            fields.reportsToPlatformAdminId,
                            "The person they report to isn't on the team.",
                        );
                    }
                    const taxIdData = sealed
                        ? {
                              taxIdCiphertext: sealed.ciphertext,
                              taxIdIv: sealed.iv,
                              taxIdAuthTag: sealed.authTag,
                          }
                        : {};
                    const before = await tx.staffProfile.findUnique({
                        where: { platformAdminId: admin.id },
                        select: PROFILE_SELECT,
                    });
                    const row = before
                        ? await tx.staffProfile.update({
                              where: { platformAdminId: admin.id },
                              data: { ...fields, ...taxIdData },
                              select: PROFILE_SELECT,
                          })
                        : await tx.staffProfile.create({
                              data: {
                                  platformAdminId: admin.id,
                                  managerCode: generateManagerCode(),
                                  ...fields,
                                  ...taxIdData,
                              },
                              select: PROFILE_SELECT,
                          });

                    await this.audit.write(tx, {
                        actorUserId: input.staff.userId,
                        permission: AdminPermission.TeamWrite,
                        action: before
                            ? "staff.profile.updated"
                            : "staff.profile.created",
                        targetType: "platform_admin",
                        targetId: admin.id,
                        reason,
                        outcome: AdminAuditOutcome.Success,
                        // Which fields changed, never their values: the
                        // ledger is read more widely than the profile.
                        metadata: {
                            changed: changedFields(before, fields),
                            taxIdReplaced: Boolean(sealed),
                        },
                    });
                    if (sealed) {
                        await this.audit.write(tx, {
                            actorUserId: input.staff.userId,
                            permission: AdminPermission.TeamPay,
                            action:
                                before && sealedTaxId(before)
                                    ? "staff.tax-id.replaced"
                                    : "staff.tax-id.set",
                            targetType: "platform_admin",
                            targetId: admin.id,
                            reason,
                            outcome: AdminAuditOutcome.Success,
                        });
                    }
                    return { ...profileView(row), created: !before };
                });
            } catch (error) {
                // Two first saves at once, or a manager code that clashed:
                // the database's unique index decided, so try again (the
                // second becomes an update, or draws a fresh code).
                if (
                    prismaErrorCode(error) === "P2002" &&
                    attempt < MANAGER_CODE_TRIES
                ) {
                    continue;
                }
                throw error;
            }
        }
    }

    private guarded<T>(change: (tx: Tx) => Promise<T>): Promise<T> {
        return guardedStaffChange(change);
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

    private async adminOrThrow(
        tx: Tx,
        platformAdminId: string,
        notFound = "Staff member not found",
    ) {
        const admin = await tx.platformAdmin.findUnique({
            where: { id: platformAdminId },
            select: { id: true, revokedAt: true },
        });
        if (!admin) throw new NotFoundException(notFound);
        return admin;
    }
}

/**
 * Run a staff change and refuse it if it would take the instance from
 * having a lasting Platform Owner to having none. An instance that never
 * had one (only the break-glass allowlist) may still grant its first.
 * Serializable, so two changes at once cannot each pass alone. Shared by
 * grants and by an invite's acceptance (`admin-staff-invites.service.ts`).
 */
export function guardedStaffChange<T>(
    change: (tx: Tx) => Promise<T>,
): Promise<T> {
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

export function requireRoles(values: string[]): AdminRole[] {
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

export function requireReason(value: string): string {
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

/** Trimmed text, or null when it is missing or blank. */
function textOrNull(value: string | null | undefined): string | null {
    const text = value?.trim();
    if (!text) return null;
    return text;
}

function sealedTaxId(row: ProfileRow) {
    return row.taxIdCiphertext && row.taxIdIv && row.taxIdAuthTag
        ? {
              ciphertext: row.taxIdCiphertext,
              iv: row.taxIdIv,
              authTag: row.taxIdAuthTag,
          }
        : null;
}

function profileView(row: ProfileRow): StaffProfileView {
    return {
        platformAdminId: row.platformAdminId,
        exists: true,
        worksAs: row.worksAs as StaffJob,
        workEmail: row.workEmail,
        phone: row.phone,
        city: row.city,
        languages: row.languages,
        joinedOn: row.joinedOn?.toISOString().slice(0, 10) ?? null,
        reportsToPlatformAdminId: row.reportsToPlatformAdminId,
        engagement: row.engagement as StaffEngagement | null,
        capacity: row.capacity,
        managerCode: row.managerCode,
        onCommission: row.onCommission,
        emergencyContact: row.emergencyContact,
        taxIdSet: sealedTaxId(row) !== null,
        updatedAt: row.updatedAt,
    };
}

function emptyProfile(
    platformAdminId: string,
    mayPay: boolean,
): StaffProfileView {
    return {
        platformAdminId,
        exists: false,
        worksAs: null,
        workEmail: null,
        phone: null,
        city: null,
        languages: [],
        joinedOn: null,
        reportsToPlatformAdminId: null,
        engagement: null,
        capacity: null,
        managerCode: null,
        onCommission: false,
        emergencyContact: null,
        taxIdSet: false,
        ...(mayPay ? { taxIdLast4: null } : {}),
        updatedAt: null,
    };
}

/** A `YYYY-MM-DD` that is a real date, as the UTC midnight Prisma writes to a DATE. */
function calendarDate(value: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
    ) {
        throw new BadRequestException("joinedOn is not a real date.");
    }
    return date;
}

/** The names of the profile fields a save changes; all of them on create. */
function changedFields(
    before: ProfileRow | null,
    after: Record<string, unknown>,
): string[] {
    return Object.keys(after).filter((key) => {
        if (!before) return true;
        const was = (before as Record<string, unknown>)[key];
        const now = after[key];
        if (was instanceof Date || now instanceof Date) {
            return (
                (was as Date | null)?.getTime() !==
                (now as Date | null)?.getTime()
            );
        }
        return JSON.stringify(was) !== JSON.stringify(now);
    });
}

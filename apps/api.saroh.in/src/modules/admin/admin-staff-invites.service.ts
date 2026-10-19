import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
    ServiceUnavailableException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { emailVerifiedBySelf } from "../../common/auth/email-verification";
import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { isBootstrapAdmin } from "../../common/guards/platform-admin.guard";
import {
    isSerializationFailure,
    prismaErrorCode,
} from "../../common/prisma-errors";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import type { AdminRole } from "./admin-permissions";
import {
    AdminPermission,
    isAdminRole,
    permissionsFor,
    AdminRole as Roles,
} from "./admin-permissions";
import {
    guardedStaffChange,
    requireReason,
    requireRoles,
} from "./admin-staff.service";
import type { StaffInviteState } from "./staff-invite";
import {
    hashStaffInviteToken,
    newStaffInviteToken,
    normaliseInviteEmail,
    rolesBeyondReach,
    STAFF_INVITE_TOKEN_PATTERN,
    staffInviteExpiry,
    staffInviteState,
} from "./staff-invite";
import { StaffInviteMailer } from "./staff-invite-mailer";
import type { StaffJob } from "./staff-profile";
import { generateManagerCode, STAFF_JOBS } from "./staff-profile";

type Tx = Prisma.TransactionClient;

/** Tries at an accept that clashed with another write (a manager code, two clicks at once). */
const ACCEPT_TRIES = 5;

/**
 * Run a Serializable write, again when the database refuses it for another
 * write at the same moment (any staff or ledger row it read changed under
 * it). The checks inside run again, so the second try still refuses what it
 * should.
 */
async function serializable<T>(
    run: (tx: Tx) => Promise<T>,
    tries = ACCEPT_TRIES,
): Promise<T> {
    for (let attempt = 1; ; attempt++) {
        try {
            return await prisma.$transaction(run, {
                isolationLevel: "Serializable",
            });
        } catch (error) {
            if (isSerializationFailure(error) && attempt < tries) continue;
            throw error;
        }
    }
}

/** How an accept that can't go ahead is told apart: `details.code`. */
export const StaffInviteRefusal = {
    Gone: "INVITE_GONE",
    WrongAccount: "INVITE_WRONG_ACCOUNT",
    EmailNotConfirmed: "INVITE_EMAIL_NOT_CONFIRMED",
    SenderCannotGrant: "INVITE_SENDER_CANNOT_GRANT",
    AlreadyOnTeam: "ALREADY_ON_TEAM",
} as const;
export type StaffInviteRefusal =
    (typeof StaffInviteRefusal)[keyof typeof StaffInviteRefusal];

const GONE_MESSAGE =
    "This invite can no longer be used. It was withdrawn, already used, or has expired. Ask whoever sent it for a new one.";
const ALREADY_ON_TEAM_MESSAGE =
    "They're already on the team. Change their roles from their page instead.";

const INVITE_SELECT = {
    id: true,
    email: true,
    name: true,
    roles: true,
    worksAs: true,
    onCommission: true,
    reason: true,
    expiresAt: true,
    invitedByUserId: true,
    sentAt: true,
    sendCount: true,
    acceptedAt: true,
    acceptedByUserId: true,
    platformAdminId: true,
    withdrawnAt: true,
    createdAt: true,
} as const satisfies Prisma.StaffInviteSelect;

type InviteRow = Prisma.StaffInviteGetPayload<{
    select: typeof INVITE_SELECT;
}>;

/** An invite as the console lists it. Never the token or its hash. */
export interface StaffInviteView {
    id: string;
    email: string;
    name: string;
    roles: AdminRole[];
    worksAs: StaffJob;
    onCommission: boolean;
    state: StaffInviteState;
    expiresAt: Date;
    sentAt: Date;
    sendCount: number;
    invitedBy: { userId: string; name: string | null };
    createdAt: Date;
}

/** What the link's holder sees before accepting (accounts' staff-invite page). */
export interface StaffInvitePreview {
    email: string;
    name: string;
    roles: AdminRole[];
    worksAs: StaffJob;
    invitedByName: string | null;
    expiresAt: Date;
}

export interface StaffInviteInput {
    staff: PlatformAdminInfo;
    email: string;
    name: string;
    roles: string[];
    worksAs: StaffJob;
    onCommission?: boolean;
    reason: string;
}

/** What a send came to: the console offers Resend when it didn't leave. */
export interface StaffInviteSent {
    inviteId: string;
    expiresAt: Date;
    emailed: boolean;
}

export interface StaffInviteAccepted {
    outcome: "joined" | "already-joined";
    platformAdminId: string;
}

/**
 * Add a teammate who has no Saroh account yet (DEC-169, admin console U24,
 * R32). A holder of `staff:grant` sends an invite by email; its one-time
 * link is valid for {@link STAFF_INVITE_VALID_DAYS} days.
 *
 * - **Only the token's hash is stored.** The token is in the email and
 *   nowhere else: not the response, the ledger or a log.
 * - **No role beyond the sender's reach.** Nobody invites someone to a role
 *   that can do something they can't (`rolesBeyondReach`), and accepting
 *   checks the last sender again: still holding `staff:grant` and every
 *   invited role's permissions, so an invite from someone revoked since
 *   grants nothing.
 * - **Accepting needs the person's own word for their address.** The
 *   signed-in account's email must be the invite's and verified by their
 *   own code (`emailVerifiedBySelf`), never by staff's Mark verified.
 * - **One transaction.** The grant (reopened when revoked before), the roles
 *   and the profile are written with the ledger row inside
 *   `guardedStaffChange`; accepting twice does nothing the second time.
 *
 * Every create, resend, withdraw and accept is on the admin ledger.
 */
@Injectable()
export class AdminStaffInvitesService {
    private readonly logger = new Logger(AdminStaffInvitesService.name);

    constructor(
        private readonly audit: AdminAuditService,
        private readonly mailer: StaffInviteMailer,
    ) {}

    /** Invites not yet accepted or withdrawn, newest first (`staff:read`). */
    async list(now: Date = new Date()): Promise<StaffInviteView[]> {
        const rows = await prisma.staffInvite.findMany({
            where: { acceptedAt: null, withdrawnAt: null },
            select: INVITE_SELECT,
            orderBy: { createdAt: "desc" },
            take: 200,
        });
        const names = await userNames(rows.map((row) => row.invitedByUserId));
        return rows.map((row) => inviteView(row, names, now));
    }

    async invite(input: StaffInviteInput): Promise<StaffInviteSent> {
        const roles = requireRoles(input.roles);
        const reason = requireReason(input.reason);
        const email = normaliseInviteEmail(input.email);
        const name = input.name.trim();
        if (!STAFF_JOBS.includes(input.worksAs)) {
            throw new BadRequestException("Choose what they work as.");
        }
        await this.assertMayInvite(input.staff, roles, "staff.invite.create");
        const base = this.requireAccountsBase();
        const token = newStaffInviteToken();
        const now = new Date();

        const invite = await serializable(async (tx) => {
            if (await onTheTeam(tx, email, now)) {
                throw new ConflictException({
                    message: ALREADY_ON_TEAM_MESSAGE,
                    details: { code: StaffInviteRefusal.AlreadyOnTeam },
                });
            }
            const open = await tx.staffInvite.findMany({
                where: { email, acceptedAt: null, withdrawnAt: null },
                select: { id: true, expiresAt: true },
            });
            if (open.some((row) => row.expiresAt > now)) {
                throw new ConflictException({
                    message:
                        "An invite to this address is already waiting. Resend it instead.",
                    details: { code: "INVITE_WAITING" },
                });
            }
            // An expired invite to the same address is replaced, so the
            // list keeps one row per person.
            if (open.length > 0) {
                await tx.staffInvite.updateMany({
                    where: { id: { in: open.map((row) => row.id) } },
                    data: {
                        withdrawnAt: now,
                        withdrawnByUserId: input.staff.userId,
                    },
                });
            }
            const created = await tx.staffInvite.create({
                data: {
                    email,
                    name,
                    roles,
                    worksAs: input.worksAs,
                    onCommission: input.onCommission ?? false,
                    reason,
                    tokenHash: hashStaffInviteToken(token),
                    expiresAt: staffInviteExpiry(now),
                    invitedByUserId: input.staff.userId,
                    sentAt: now,
                },
                select: { id: true, expiresAt: true },
            });
            await this.audit.write(tx, {
                actorUserId: input.staff.userId,
                permission: AdminPermission.StaffGrant,
                action: "staff.invite.created",
                targetType: "staff_invite",
                targetId: created.id,
                reason,
                outcome: AdminAuditOutcome.Success,
                metadata: {
                    roles,
                    worksAs: input.worksAs,
                    onCommission: input.onCommission ?? false,
                    replacedExpired: open.length,
                    expiresAt: created.expiresAt.toISOString(),
                },
            });
            return created;
        });

        const emailed = await this.send(email, {
            base,
            token,
            name,
            invitedByUserId: input.staff.userId,
        });
        return { inviteId: invite.id, expiresAt: invite.expiresAt, emailed };
    }

    /**
     * Send the invite again with a new link: the old token stops working,
     * the 7 days start over, and the resender becomes the sender accepting
     * checks. Needs the same reach as sending it.
     */
    async resend(input: {
        staff: PlatformAdminInfo;
        inviteId: string;
        reason: string;
    }): Promise<StaffInviteSent> {
        const reason = requireReason(input.reason);
        const current = await prisma.staffInvite.findUnique({
            where: { id: input.inviteId },
            select: INVITE_SELECT,
        });
        if (!current) throw new NotFoundException("Invite not found");
        await this.assertMayInvite(
            input.staff,
            inviteRoles(current),
            "staff.invite.resend",
        );
        const base = this.requireAccountsBase();
        const token = newStaffInviteToken();
        const now = new Date();

        const invite = await serializable(async (tx) => {
            const row = await tx.staffInvite.findUnique({
                where: { id: input.inviteId },
                select: INVITE_SELECT,
            });
            if (!row) throw new NotFoundException("Invite not found");
            if (row.acceptedAt) {
                throw new ConflictException(
                    "They already accepted this invite.",
                );
            }
            if (row.withdrawnAt) {
                throw new ConflictException(
                    "This invite was withdrawn. Send a new one.",
                );
            }
            const updated = await tx.staffInvite.update({
                where: { id: row.id },
                data: {
                    tokenHash: hashStaffInviteToken(token),
                    expiresAt: staffInviteExpiry(now),
                    sentAt: now,
                    sendCount: { increment: 1 },
                    invitedByUserId: input.staff.userId,
                },
                select: INVITE_SELECT,
            });
            await this.audit.write(tx, {
                actorUserId: input.staff.userId,
                permission: AdminPermission.StaffGrant,
                action: "staff.invite.resent",
                targetType: "staff_invite",
                targetId: row.id,
                reason,
                outcome: AdminAuditOutcome.Success,
                metadata: {
                    sendCount: updated.sendCount,
                    wasExpired: row.expiresAt <= now,
                    expiresAt: updated.expiresAt.toISOString(),
                },
            });
            return updated;
        });

        const emailed = await this.send(invite.email, {
            base,
            token,
            name: invite.name,
            invitedByUserId: input.staff.userId,
        });
        return { inviteId: invite.id, expiresAt: invite.expiresAt, emailed };
    }

    /** Take an invite back: its link stops working. Withdrawing twice changes nothing. */
    async withdraw(input: {
        staff: PlatformAdminInfo;
        inviteId: string;
        reason: string;
    }): Promise<{ inviteId: string; changed: boolean }> {
        const reason = requireReason(input.reason);
        assertGrants(input.staff);
        return serializable(async (tx) => {
            const row = await tx.staffInvite.findUnique({
                where: { id: input.inviteId },
                select: INVITE_SELECT,
            });
            if (!row) throw new NotFoundException("Invite not found");
            if (row.acceptedAt) {
                throw new ConflictException(
                    "They already accepted this invite. Take their access away from their page instead.",
                );
            }
            if (row.withdrawnAt) return { inviteId: row.id, changed: false };
            await tx.staffInvite.update({
                where: { id: row.id },
                data: {
                    withdrawnAt: new Date(),
                    withdrawnByUserId: input.staff.userId,
                },
            });
            await this.audit.write(tx, {
                actorUserId: input.staff.userId,
                permission: AdminPermission.StaffGrant,
                action: "staff.invite.withdrawn",
                targetType: "staff_invite",
                targetId: row.id,
                reason,
                outcome: AdminAuditOutcome.Success,
                metadata: { roles: row.roles },
            });
            return { inviteId: row.id, changed: true };
        });
    }

    /**
     * The invite behind a link, for its holder (no session needed). Every
     * reason it can't be shown (unknown, withdrawn, used, expired) is the
     * same 404, as for a business's invitations.
     */
    async preview(token: string): Promise<StaffInvitePreview> {
        const row = await findByToken(prisma, token);
        if (!row || staffInviteState(row, new Date()) !== "waiting") {
            throw gone();
        }
        const names = await userNames([row.invitedByUserId]);
        return {
            email: row.email,
            name: row.name,
            roles: inviteRoles(row),
            worksAs: row.worksAs as StaffJob,
            invitedByName: names.get(row.invitedByUserId) ?? null,
            expiresAt: row.expiresAt,
        };
    }

    /**
     * Accept an invite as the signed-in person. Makes the grant, the roles
     * and the profile with a ledger row in one transaction; a second accept
     * by the same person answers `already-joined` and writes nothing.
     */
    async accept(
        user: { id: string },
        token: string,
    ): Promise<StaffInviteAccepted> {
        for (let attempt = 1; ; attempt++) {
            try {
                const result = await guardedStaffChange((tx) =>
                    this.acceptIn(tx, user.id, token),
                );
                if ("refused" in result) {
                    await this.audit.recordRead({
                        actorUserId: user.id,
                        permission: AdminPermission.StaffGrant,
                        action: "staff.invite.accept",
                        targetType: "staff_invite",
                        targetId: result.inviteId,
                        outcome: AdminAuditOutcome.Denied,
                        metadata: { refusal: result.refused },
                    });
                    throw refusal(result.refused);
                }
                return result;
            } catch (error) {
                // A manager code that clashed, or another accept of the same
                // invite at the same moment: the database decided, so read
                // again (the second becomes `already-joined`).
                const code = prismaErrorCode(error);
                if (
                    (code === "P2002" || code === "P2034") &&
                    attempt < ACCEPT_TRIES
                ) {
                    continue;
                }
                throw error;
            }
        }
    }

    private async acceptIn(
        tx: Tx,
        userId: string,
        token: string,
    ): Promise<
        StaffInviteAccepted | { refused: StaffInviteRefusal; inviteId: string }
    > {
        const row = await findByToken(tx, token);
        if (!row) throw gone();
        if (row.acceptedAt) {
            if (row.acceptedByUserId === userId && row.platformAdminId) {
                return {
                    outcome: "already-joined",
                    platformAdminId: row.platformAdminId,
                };
            }
            throw gone();
        }
        const now = new Date();
        if (staffInviteState(row, now) !== "waiting") throw gone();

        const person = await tx.user.findUnique({
            where: { id: userId },
            select: {
                email: true,
                name: true,
                emailVerified: true,
                emailVerifiedByStaffAt: true,
            },
        });
        if (!person) throw gone();
        if (normaliseInviteEmail(person.email) !== row.email) {
            return {
                refused: StaffInviteRefusal.WrongAccount,
                inviteId: row.id,
            };
        }
        if (!emailVerifiedBySelf(person)) {
            return {
                refused: StaffInviteRefusal.EmailNotConfirmed,
                inviteId: row.id,
            };
        }
        const roles = inviteRoles(row);
        const senderMay = await staffPermissionsOf(
            tx,
            row.invitedByUserId,
            now,
        );
        if (
            !senderMay.includes(AdminPermission.StaffGrant) ||
            rolesBeyondReach(roles, senderMay).length > 0
        ) {
            return {
                refused: StaffInviteRefusal.SenderCannotGrant,
                inviteId: row.id,
            };
        }
        if (await onTheTeam(tx, row.email, now)) {
            return {
                refused: StaffInviteRefusal.AlreadyOnTeam,
                inviteId: row.id,
            };
        }

        const admin = await tx.platformAdmin.upsert({
            where: { userId },
            create: {
                userId,
                grantedByUserId: row.invitedByUserId,
                note: row.reason,
            },
            update: {},
            select: { id: true, revokedAt: true },
        });
        const reopened = Boolean(admin.revokedAt);
        if (reopened) {
            await tx.platformAdmin.update({
                where: { id: admin.id },
                data: {
                    revokedAt: null,
                    grantedAt: now,
                    grantedByUserId: row.invitedByUserId,
                    note: row.reason,
                },
            });
        }
        await tx.platformAdminRoleAssignment.createMany({
            data: roles.map((role) => ({
                platformAdminId: admin.id,
                role,
                assignedByUserId: row.invitedByUserId,
                reason: row.reason,
                expiresAt: null,
            })),
        });
        const profile = {
            worksAs: row.worksAs,
            workEmail: row.email,
            onCommission: row.onCommission,
        };
        const hadProfile = await tx.staffProfile.findUnique({
            where: { platformAdminId: admin.id },
            select: { id: true },
        });
        if (hadProfile) {
            await tx.staffProfile.update({
                where: { platformAdminId: admin.id },
                data: profile,
            });
        } else {
            await tx.staffProfile.create({
                data: {
                    platformAdminId: admin.id,
                    managerCode: generateManagerCode(),
                    ...profile,
                },
            });
        }
        if (!person.name?.trim()) {
            await tx.user.update({
                where: { id: userId },
                data: { name: row.name },
            });
        }
        await tx.staffInvite.update({
            where: { id: row.id },
            data: {
                acceptedAt: now,
                acceptedByUserId: userId,
                platformAdminId: admin.id,
            },
        });
        await this.audit.write(tx, {
            actorUserId: userId,
            permission: AdminPermission.StaffGrant,
            action: "staff.invite.accepted",
            targetType: "platform_admin",
            targetId: admin.id,
            reason: row.reason,
            outcome: AdminAuditOutcome.Success,
            metadata: {
                inviteId: row.id,
                invitedByUserId: row.invitedByUserId,
                roles,
                worksAs: row.worksAs,
                onCommission: row.onCommission,
                reopened,
                profileCreated: !hadProfile,
            },
        });
        return { outcome: "joined", platformAdminId: admin.id };
    }

    /**
     * The sender holds `staff:grant` and reaches every role on the invite;
     * a refusal is on the ledger as DENIED and names the roles in words the
     * console shows.
     */
    private async assertMayInvite(
        staff: PlatformAdminInfo,
        roles: AdminRole[],
        action: string,
    ): Promise<void> {
        assertGrants(staff);
        const beyond = rolesBeyondReach(roles, staff.permissions);
        if (beyond.length === 0) return;
        await this.audit.recordRead({
            actorUserId: staff.userId,
            permission: AdminPermission.StaffGrant,
            action,
            targetType: "staff_invite",
            outcome: AdminAuditOutcome.Denied,
            metadata: { beyondReach: beyond },
        });
        throw new ForbiddenException({
            message: `You can't invite someone to a role that can do more than you can: ${beyond.join(", ")}.`,
            details: { code: "ROLE_BEYOND_REACH", roles: beyond },
        });
    }

    private requireAccountsBase(): string {
        const base = this.mailer.accountsBase();
        if (!base) {
            throw new ServiceUnavailableException(
                "Saroh doesn't know where its sign-in site is, so the invite would have no link. Set ACCOUNTS_URL on the API.",
            );
        }
        return base;
    }

    /** Send after the write has committed. A failed send leaves the invite for Resend. */
    private async send(
        to: string,
        details: {
            base: string;
            token: string;
            name: string;
            invitedByUserId: string;
        },
    ): Promise<boolean> {
        const names = await userNames([details.invitedByUserId]);
        const outcome = await this.mailer.send(to, {
            base: details.base,
            token: details.token,
            name: details.name,
            invitedByName: names.get(details.invitedByUserId) ?? null,
        });
        if (outcome !== "sent") {
            this.logger.warn(`staff_invite_email_${outcome}`);
        }
        return outcome === "sent";
    }
}

function assertGrants(staff: PlatformAdminInfo): void {
    if (!staff.permissions.includes(AdminPermission.StaffGrant)) {
        throw new ForbiddenException(
            "Only a Platform owner can add teammates.",
        );
    }
}

function gone(): NotFoundException {
    return new NotFoundException({
        message: GONE_MESSAGE,
        details: { code: StaffInviteRefusal.Gone },
    });
}

/** The answer for an accept that can't go ahead, in words the page shows. */
function refusal(code: StaffInviteRefusal) {
    switch (code) {
        case StaffInviteRefusal.WrongAccount:
            return new ForbiddenException({
                message:
                    "This invite is for another email address. Sign in with the address it was sent to.",
                details: { code },
            });
        case StaffInviteRefusal.EmailNotConfirmed:
            return new ForbiddenException({
                message:
                    "Confirm your email address first: sign out, then sign in again with a code sent to it.",
                details: { code },
            });
        case StaffInviteRefusal.SenderCannotGrant:
            return new ForbiddenException({
                message:
                    "Whoever sent this invite can't add teammates any more. Ask someone on the team for a new one.",
                details: { code },
            });
        case StaffInviteRefusal.AlreadyOnTeam:
            return new ConflictException({
                message: "You're already on the team.",
                details: { code },
            });
        case StaffInviteRefusal.Gone:
            return gone();
    }
}

async function findByToken(
    db: Pick<Tx, "staffInvite">,
    token: string,
): Promise<InviteRow | null> {
    if (!STAFF_INVITE_TOKEN_PATTERN.test(token)) return null;
    return db.staffInvite.findUnique({
        where: { tokenHash: hashStaffInviteToken(token) },
        select: INVITE_SELECT,
    });
}

function inviteRoles(row: Pick<InviteRow, "roles">): AdminRole[] {
    return row.roles.filter(isAdminRole);
}

/** Whether the address belongs to someone with active staff access now. */
async function onTheTeam(tx: Tx, email: string, now: Date): Promise<boolean> {
    const user = await tx.user.findUnique({
        where: { email },
        select: { id: true },
    });
    if (!user) return false;
    const held = await tx.platformAdminRoleAssignment.count({
        where: {
            platformAdmin: { userId: user.id, revokedAt: null },
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
    });
    return held > 0;
}

/**
 * What a person may do on the console now, as `PlatformAdminGuard` would
 * find it: their active grant's roles, else the break-glass allowlist's
 * Platform owner, else nothing.
 */
async function staffPermissionsOf(tx: Tx, userId: string, now: Date) {
    const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
            email: true,
            platformAdmin: {
                select: {
                    revokedAt: true,
                    roleAssignments: {
                        where: {
                            revokedAt: null,
                            OR: [
                                { expiresAt: null },
                                { expiresAt: { gt: now } },
                            ],
                        },
                        select: { role: true },
                    },
                },
            },
        },
    });
    if (!user) return [];
    const grant = user.platformAdmin;
    const roles =
        grant && !grant.revokedAt
            ? grant.roleAssignments
                  .map((assignment) => assignment.role)
                  .filter(isAdminRole)
            : [];
    if (roles.length > 0) return permissionsFor(roles);
    return isBootstrapAdmin(user.email)
        ? permissionsFor([Roles.PlatformOwner])
        : [];
}

async function userNames(ids: string[]): Promise<Map<string, string | null>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const users = await prisma.user.findMany({
        where: { id: { in: unique } },
        select: { id: true, name: true },
    });
    return new Map(users.map((user) => [user.id, user.name]));
}

function inviteView(
    row: InviteRow,
    names: Map<string, string | null>,
    now: Date,
): StaffInviteView {
    return {
        id: row.id,
        email: row.email,
        name: row.name,
        roles: inviteRoles(row),
        worksAs: row.worksAs as StaffJob,
        onCommission: row.onCommission,
        state: staffInviteState(row, now),
        expiresAt: row.expiresAt,
        sentAt: row.sentAt,
        sendCount: row.sendCount,
        invitedBy: {
            userId: row.invitedByUserId,
            name: names.get(row.invitedByUserId) ?? null,
        },
        createdAt: row.createdAt,
    };
}

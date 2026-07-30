import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { AdminAccessSession } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import { AdminPermission } from "./admin-permissions";

const ACCESS_DURATION_MS = 30 * 60 * 1000;
const MIN_REASON_LENGTH = 4;

export const OrganizationLifecycleStatus = {
    Active: "ACTIVE",
    Suspended: "SUSPENDED",
    PendingDeletion: "PENDING_DELETION",
    DeletedRetained: "DELETED_RETAINED",
} as const;

export type OrganizationLifecycleStatus =
    (typeof OrganizationLifecycleStatus)[keyof typeof OrganizationLifecycleStatus];

const ALLOWED_LIFECYCLE_TRANSITIONS: Record<
    OrganizationLifecycleStatus,
    readonly OrganizationLifecycleStatus[]
> = {
    [OrganizationLifecycleStatus.Active]: [
        OrganizationLifecycleStatus.Suspended,
        OrganizationLifecycleStatus.PendingDeletion,
    ],
    [OrganizationLifecycleStatus.Suspended]: [
        OrganizationLifecycleStatus.Active,
        OrganizationLifecycleStatus.PendingDeletion,
    ],
    [OrganizationLifecycleStatus.PendingDeletion]: [
        OrganizationLifecycleStatus.Active,
        OrganizationLifecycleStatus.Suspended,
        OrganizationLifecycleStatus.DeletedRetained,
    ],
    [OrganizationLifecycleStatus.DeletedRetained]: [],
};

export function assertOrganizationLifecycleTransition(
    from: OrganizationLifecycleStatus,
    to: OrganizationLifecycleStatus,
): void {
    if (!ALLOWED_LIFECYCLE_TRANSITIONS[from].includes(to)) {
        throw new ConflictException(
            `Organization lifecycle cannot transition from ${from} to ${to}`,
        );
    }
}

export interface OpenAdminAccessInput {
    organizationId: string;
    staff: PlatformAdminInfo;
    reason: string;
    idempotencyKey: string;
}

export interface AuthorizeAdminAccessInput {
    sessionId: string;
    organizationId: string;
    staff: PlatformAdminInfo;
    intent: "READ" | "WRITE";
}

export interface RevokeAdminAccessInput {
    sessionId: string;
    organizationId: string;
    staff: PlatformAdminInfo;
    reason: string;
    idempotencyKey?: string;
}

type AccessSessionWithGrant = AdminAccessSession & {
    platformAdmin: { revokedAt: Date | null } | null;
};

/**
 * Issues and verifies reason-bound, read-only Organization support access.
 *
 * An access session is deliberately separate from tenant Membership. It lasts
 * 30 minutes, is scoped to exactly one Organization, and cannot authorize a
 * write even when the staff member has another control-plane write permission.
 */
@Injectable()
export class AdminAccessService {
    constructor(private readonly audit: AdminAuditService) {}

    async open(input: OpenAdminAccessInput) {
        const reason = requireReason(input.reason);
        const now = new Date();
        const expiresAt = new Date(now.getTime() + ACCESS_DURATION_MS);
        const idempotencyKey = [
            input.staff.userId,
            input.organizationId,
            input.idempotencyKey,
        ].join(":");

        return prisma.$transaction(async (tx) => {
            const replay = await tx.adminAccessSession.findUnique({
                where: { idempotencyKey },
            });
            if (replay) return replay;

            const organization = await tx.organization.findUnique({
                where: { id: input.organizationId },
                select: { id: true, lifecycleStatus: true },
            });
            if (!organization) {
                throw new NotFoundException("Organization not found");
            }
            if (
                organization.lifecycleStatus ===
                OrganizationLifecycleStatus.DeletedRetained
            ) {
                throw new ConflictException(
                    "Retained deleted Organizations cannot be opened",
                );
            }

            // One active support window per staff member and Organization keeps
            // the audit timeline unambiguous. Opening another window closes the
            // previous one at the same instant.
            await tx.adminAccessSession.updateMany({
                where: {
                    actorUserId: input.staff.userId,
                    organizationId: input.organizationId,
                    revokedAt: null,
                },
                data: {
                    revokedAt: now,
                    revokedByUserId: input.staff.userId,
                },
            });

            const session = await tx.adminAccessSession.create({
                data: {
                    organizationId: input.organizationId,
                    platformAdminId: input.staff.platformAdminId,
                    actorUserId: input.staff.userId,
                    reason,
                    scope: "READ_ONLY",
                    expiresAt,
                    idempotencyKey,
                },
            });

            await this.audit.write(tx, {
                actorUserId: input.staff.userId,
                permission: AdminPermission.OrganizationViewAs,
                action: "organization.access.open",
                targetType: "admin_access_session",
                targetId: session.id,
                organizationId: input.organizationId,
                reason,
                outcome: AdminAuditOutcome.Success,
                idempotencyKey: `organization.access.open:${idempotencyKey}`,
                metadata: {
                    scope: "READ_ONLY",
                    expiresAt: expiresAt.toISOString(),
                },
            });

            return session;
        });
    }

    async authorize(
        input: AuthorizeAdminAccessInput,
    ): Promise<AccessSessionWithGrant> {
        const session = await prisma.adminAccessSession.findUnique({
            where: { id: input.sessionId },
            include: {
                platformAdmin: { select: { revokedAt: true } },
            },
        });

        if (!session) {
            return this.deny(input, "NOT_FOUND");
        }
        if (
            session.organizationId !== input.organizationId ||
            session.actorUserId !== input.staff.userId
        ) {
            return this.deny(input, "ORGANIZATION_MISMATCH");
        }
        if (
            session.platformAdminId !== input.staff.platformAdminId ||
            (session.platformAdminId === null && !input.staff.viaBootstrap)
        ) {
            return this.deny(input, "STAFF_MISMATCH");
        }
        if (session.revokedAt !== null) {
            return this.deny(input, "REVOKED");
        }
        if (session.scope !== "READ_ONLY" || input.intent === "WRITE") {
            return this.deny(input, "READ_ONLY");
        }

        if (session.platformAdminId !== null) {
            const activeGrant = await prisma.platformAdmin.findUnique({
                where: { id: session.platformAdminId },
                select: { revokedAt: true },
            });
            if (activeGrant?.revokedAt !== null) {
                return this.deny(input, "STAFF_REVOKED");
            }
        }

        if (session.expiresAt <= new Date()) {
            await this.expire(session, input.staff);
            throw new ForbiddenException("Organization access session expired");
        }

        return session;
    }

    async revoke(input: RevokeAdminAccessInput): Promise<void> {
        const reason = requireReason(input.reason);
        const now = new Date();

        await prisma.$transaction(async (tx) => {
            const session = await tx.adminAccessSession.findUnique({
                where: { id: input.sessionId },
            });
            if (
                session?.organizationId !== input.organizationId ||
                session.actorUserId !== input.staff.userId
            ) {
                throw new ForbiddenException(
                    "Organization access session unavailable",
                );
            }
            if (session.revokedAt !== null) return;

            await tx.adminAccessSession.update({
                where: { id: session.id },
                data: {
                    revokedAt: now,
                    revokedByUserId: input.staff.userId,
                    revocationReason: reason,
                },
            });

            await this.audit.write(tx, {
                actorUserId: input.staff.userId,
                permission: AdminPermission.OrganizationViewAs,
                action: "organization.access.close",
                targetType: "admin_access_session",
                targetId: session.id,
                organizationId: input.organizationId,
                reason,
                outcome: AdminAuditOutcome.Success,
                idempotencyKey: input.idempotencyKey
                    ? [
                          "organization.access.close",
                          input.staff.userId,
                          session.id,
                          input.idempotencyKey,
                      ].join(":")
                    : undefined,
            });
        });
    }

    private async expire(
        session: AccessSessionWithGrant,
        staff: PlatformAdminInfo,
    ): Promise<void> {
        const now = new Date();
        await prisma.$transaction(async (tx) => {
            await tx.adminAccessSession.update({
                where: { id: session.id },
                data: {
                    revokedAt: now,
                    revokedByUserId: null,
                },
            });
            await this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.OrganizationViewAs,
                action: "organization.access.expired",
                targetType: "admin_access_session",
                targetId: session.id,
                organizationId: session.organizationId,
                outcome: AdminAuditOutcome.Denied,
                metadata: { reasonCode: "EXPIRED" },
            });
        });
    }

    private async deny(
        input: AuthorizeAdminAccessInput,
        reasonCode: string,
    ): Promise<never> {
        await this.audit.recordRead({
            actorUserId: input.staff.userId,
            permission: AdminPermission.OrganizationViewAs,
            action: "organization.access.denied",
            targetType: "admin_access_session",
            targetId: input.sessionId,
            organizationId: input.organizationId,
            outcome: AdminAuditOutcome.Denied,
            metadata: {
                reasonCode,
                intent: input.intent,
            },
        });
        throw new ForbiddenException("Organization access session unavailable");
    }
}

function requireReason(value: string): string {
    const reason = value.trim();
    if (reason.length < MIN_REASON_LENGTH) {
        throw new BadRequestException(
            "Give a reason for Organization support access",
        );
    }
    return reason;
}

import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    Logger,
    UnauthorizedException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import { editionOfHost } from "@saroh/edition";
import type { IncomingHttpHeaders } from "node:http";

import { env } from "../../env";
import { AdminAuditOutcome } from "../../modules/admin/admin-audit.service";
import {
    AdminPermission,
    AdminRole,
    isAdminRole,
    permissionsFor,
} from "../../modules/admin/admin-permissions";
import type { PlatformAdminInfo } from "../decorators/platform-admin-context.decorator";
import type { AuthUser } from "../types/store-context";
import {
    adminSessionMaxAge,
    assertAdminWriteOrigin,
    assertSessionFresh,
    auditOnce,
} from "./admin-session";

interface PlatformAdminRequest {
    method?: string;
    headers?: IncomingHttpHeaders;
    user?: AuthUser;
    session?: { id: string; createdAt?: Date | string };
    platformAdmin?: PlatformAdminInfo;
}

/**
 * Saroh STAFF gate for the `/admin` control plane (S1-012).
 *
 * This is the one guard that is NOT tenant-scoped. Every other authorization
 * path in the API answers "may this user act inside this Organization?"; this
 * answers "is this user Saroh staff?", which is the right to act across all of
 * them. It therefore deliberately shares nothing with `organization-policy` —
 * no Organization role, however senior, can satisfy it, so a tenant OWNER can
 * never escalate into the control plane by editing their own org.
 *
 * Two ways to pass, both fail-closed:
 *   1. An ACTIVE `PlatformAdmin` row with at least one active fixed role — the
 *      normal path. Revocation and role changes take effect on the very next
 *      request; nothing is cached.
 *   2. `ADMIN_ALLOWLIST` — break-glass only. It seeds the first admin (before
 *      any row can be granted) and recovers access if every grant is revoked by
 *      mistake, so it works only while no active Platform owner grant exists
 *      (review A3). Each session that uses it writes `staff.break-glass.used`
 *      to the ledger: config is not an audit trail.
 *
 * Before either (review A2, A7): a write must carry its origin, and the
 * session must be signed in within `ADMIN_SESSION_MAX_AGE_MINUTES`. A
 * staff session's first `/admin` request, and a refused caller (once an
 * hour), are on the ledger (B4).
 *
 * Runs AFTER `BetterAuthGuard`, which sets `request.user`.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
    private readonly logger = new Logger(PlatformAdminGuard.name);

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context
            .switchToHttp()
            .getRequest<PlatformAdminRequest>();

        const user = request.user;
        if (!user) {
            throw new UnauthorizedException("Authentication required");
        }
        assertAdminWriteOrigin(request.method, request.headers);

        // Unlike a business's, the console's edition is its address (DEC-204
        // item 6). The Host is the caller's to set, so the grant below decides
        // whether they may have it.
        const host = request.headers?.host;
        const edition = host ? (editionOfHost(host) ?? null) : null;

        const now = new Date();
        const grant = await prisma.platformAdmin.findUnique({
            where: { userId: user.id },
            select: {
                id: true,
                revokedAt: true,
                editions: true,
                roleAssignments: {
                    where: {
                        revokedAt: null,
                        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                    },
                    select: {
                        role: true,
                        expiresAt: true,
                        revokedAt: true,
                    },
                },
            },
        });

        if (grant?.revokedAt === null) {
            const roles = resolveActiveRoles(grant.roleAssignments, now);
            if (roles.length > 0) {
                if (
                    edition &&
                    !roles.includes(AdminRole.PlatformOwner) &&
                    !grant.editions.includes(edition)
                ) {
                    throw new ForbiddenException({
                        message: "Your access doesn't include this edition.",
                        details: { reason: "edition_not_granted" },
                    });
                }
                assertSessionFresh(request.session, adminSessionMaxAge());
                request.platformAdmin = {
                    userId: user.id,
                    platformAdminId: grant.id,
                    roles,
                    permissions: permissionsFor(roles),
                    viaBootstrap: false,
                    edition,
                };
                await noteSession(request, "staff.session.started");
                return true;
            }
        }

        if (isBootstrapAdmin(user.email) && !(await hasActiveOwner())) {
            assertSessionFresh(request.session, adminSessionMaxAge());
            this.logger.warn(
                `Platform admin access granted to ${user.email} via ADMIN_ALLOWLIST bootstrap (no PlatformAdmin grant).`,
            );
            const roles = [AdminRole.PlatformOwner];
            request.platformAdmin = {
                userId: user.id,
                platformAdminId: null,
                roles,
                permissions: permissionsFor(roles),
                viaBootstrap: true,
                edition,
            };
            await noteSession(request, "staff.break-glass.used");
            return true;
        }

        await auditOnce(
            {
                actorUserId: user.id,
                permission: AdminPermission.PlatformRead,
                action: "admin.access.refused",
                targetType: "admin",
                outcome: AdminAuditOutcome.Denied,
            },
            { actorUserId: user.id },
        );

        // Deliberately identical message whether the user has a revoked grant or
        // never had one: the control plane should not confirm who used to be
        // staff.
        throw new ForbiddenException("Platform administrator access required");
    }
}

/** One ledger row per session for `action` (sign-in seen, or break-glass). */
async function noteSession(
    request: PlatformAdminRequest,
    action: string,
): Promise<void> {
    const staff = request.platformAdmin;
    const sessionId = request.session?.id;
    if (!staff || !sessionId) return;
    await auditOnce(
        {
            actorUserId: staff.userId,
            permission: AdminPermission.PlatformRead,
            action,
            targetType: "session",
            targetId: sessionId,
            outcome: AdminAuditOutcome.Success,
            metadata: { viaBootstrap: staff.viaBootstrap },
        },
        { sessionId },
    );
}

/** A3: break-glass closes once a recorded, active Platform owner exists. */
async function hasActiveOwner(): Promise<boolean> {
    const now = new Date();
    const owner = await prisma.platformAdminRoleAssignment.findFirst({
        where: {
            role: AdminRole.PlatformOwner,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            platformAdmin: { revokedAt: null },
        },
        select: { id: true },
    });
    return owner !== null;
}

interface RoleAssignment {
    role: string;
    expiresAt: Date | null;
    revokedAt: Date | null;
}

function resolveActiveRoles(
    assignments: readonly RoleAssignment[],
    now: Date,
): AdminRole[] {
    const active = new Set<AdminRole>();
    for (const assignment of assignments) {
        if (assignment.revokedAt !== null) continue;
        if (assignment.expiresAt !== null && assignment.expiresAt <= now) {
            continue;
        }
        if (isAdminRole(assignment.role)) active.add(assignment.role);
    }

    return Object.values(AdminRole).filter((role) => active.has(role));
}

/** True when `email` is listed in the break-glass `ADMIN_ALLOWLIST`. */
export function isBootstrapAdmin(email: string | null | undefined): boolean {
    const normalized = email?.trim().toLowerCase();
    if (!normalized) return false;

    const allow = (env.ADMIN_ALLOWLIST ?? "")
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);

    return allow.includes(normalized);
}

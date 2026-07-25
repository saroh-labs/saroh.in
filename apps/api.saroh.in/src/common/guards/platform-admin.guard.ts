import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    Logger,
    UnauthorizedException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { env } from "../../env";
import type { AuthUser } from "../types/store-context";

interface PlatformAdminRequest {
    user?: AuthUser;
    platformAdmin?: { userId: string; viaBootstrap: boolean };
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
 *   1. An ACTIVE `PlatformAdmin` row (`revokedAt` null) — the normal path.
 *      Revocation takes effect on the very next request; nothing is cached.
 *   2. `ADMIN_ALLOWLIST` — break-glass only. It seeds the first admin (before
 *      any row can be granted) and recovers access if every grant is revoked by
 *      mistake. Use of this path is logged at WARN precisely because it bypasses
 *      the grant record: config is not an audit trail.
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

        const grant = await prisma.platformAdmin.findUnique({
            where: { userId: user.id },
            select: { revokedAt: true },
        });

        if (grant?.revokedAt === null) {
            request.platformAdmin = { userId: user.id, viaBootstrap: false };
            return true;
        }

        if (isBootstrapAdmin(user.email)) {
            this.logger.warn(
                `Platform admin access granted to ${user.email} via ADMIN_ALLOWLIST bootstrap (no PlatformAdmin grant).`,
            );
            request.platformAdmin = { userId: user.id, viaBootstrap: true };
            return true;
        }

        // Deliberately identical message whether the user has a revoked grant or
        // never had one: the control plane should not confirm who used to be
        // staff.
        throw new ForbiddenException("Platform administrator access required");
    }
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

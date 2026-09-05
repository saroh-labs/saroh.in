import type { CanActivate, ExecutionContext } from "@nestjs/common";
import {
    BadRequestException,
    Injectable,
    SetMetadata,
    UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { AdminAccessService } from "./admin-access.service";

export const ORGANIZATION_ACCESS_INTENT = "organizationAccessIntent";

/** Header carrying the id of the open support-access session. */
export const ACCESS_SESSION_HEADER = "x-admin-access-session";

/**
 * Require an open, reason-bound support-access session for this route.
 *
 * `AdminAccessService.authorize()` is the control the audit ledger claims:
 * it rejects a session that is for another Organization, opened by another
 * staff member, revoked, expired, or being used to write. Until this decorator
 * existed it had **zero production callers** (#139) — sessions could be opened
 * and revoked, and nothing in between ever consulted one. A ledger recording
 * an authorization that no code performs is worse than no ledger, because an
 * audit reads it as assurance.
 *
 * Applying this to a route is what makes the record true. Any admin route that
 * reads an Organization's own data must carry it.
 */
export const RequireOrganizationAccessSession = (
    intent: "READ" | "WRITE" = "READ",
) => SetMetadata(ORGANIZATION_ACCESS_INTENT, intent);

interface GuardedRequest {
    platformAdmin: PlatformAdminInfo;
    params: Record<string, string | undefined>;
    headers: Record<string, string | string[] | undefined>;
    adminAccessSessionId?: string;
}

/**
 * Runs `authorize()` for every route marked with
 * {@link RequireOrganizationAccessSession}.
 *
 * Deliberately does nothing on an unmarked route: this guard is mounted on the
 * whole admin controller, and most of its surface (flags, metrics, audit) is
 * platform-level and answers to no Organization. Marking is what opts a route
 * in.
 *
 * Every rejection path inside `authorize()` writes a Denied audit row and, per
 * SEC-008, fails the request if that row cannot be written. Nothing here
 * swallows that.
 */
@Injectable()
export class OrganizationAccessSessionGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly access: AdminAccessService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const intent = this.reflector.getAllAndOverride<
            "READ" | "WRITE" | undefined
        >(ORGANIZATION_ACCESS_INTENT, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!intent) return true;

        const request = context.switchToHttp().getRequest<GuardedRequest>();

        const organizationId = request.params.organizationId;
        if (!organizationId) {
            throw new BadRequestException(
                "This route requires an organizationId parameter.",
            );
        }

        const header = request.headers[ACCESS_SESSION_HEADER];
        const sessionId = Array.isArray(header) ? header[0] : header;
        if (!sessionId) {
            // Not a denial worth auditing: no session was named, so there is no
            // session to record a denial against. Opening one is a separate,
            // already-audited action.
            throw new UnauthorizedException(
                `Reading this Organization requires an open support-access session. ` +
                    `Open one and send its id in the ${ACCESS_SESSION_HEADER} header.`,
            );
        }

        // Throws on every failure path, each of which audits its own reason
        // code. An expired session is closed here rather than by a background
        // job, so it stops authorizing on the very next request.
        await this.access.authorize({
            sessionId,
            organizationId,
            staff: request.platformAdmin,
            intent,
        });

        request.adminAccessSessionId = sessionId;
        return true;
    }
}

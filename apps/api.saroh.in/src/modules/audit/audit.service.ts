import { Injectable, Logger } from "@nestjs/common";
import type { AuditEvent, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

/**
 * The closed set of auditable actions (S1-009). Kept as a typed enum-like
 * const so call sites never pass a raw, typo-prone string. Grouped by the
 * sensitive Organization surfaces this stream covers: membership, Team,
 * Project access, profile, and security actions.
 */
export const AuditAction = {
    OrganizationOnboard: "organization.onboard",
    ProfileUpdate: "profile.update",
    MembershipInvite: "membership.invite",
    MembershipAccept: "membership.accept",
    MembershipRemove: "membership.remove",
    MembershipRoleUpdate: "membership.role.update",
    TeamCreate: "team.create",
    TeamUpdate: "team.update",
    TeamDelete: "team.delete",
    ProjectAccessGrant: "project.access.grant",
    ProjectAccessRevoke: "project.access.revoke",
    SecretAccess: "secret.access",
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

/**
 * Outcome of an audited action. DENIED is distinct from FAILURE: DENIED means
 * the policy refused the actor; FAILURE means the action was permitted but
 * errored while executing.
 */
export const AuditOutcome = {
    Success: "SUCCESS",
    Failure: "FAILURE",
    Denied: "DENIED",
} as const;

export type AuditOutcome = (typeof AuditOutcome)[keyof typeof AuditOutcome];

/** The shape a caller records. Ids are bare strings by design (no relations). */
export interface AuditEventInput {
    action: AuditAction;
    actorUserId: string;
    organizationId: string;
    /** Optional Project scope (Projects arrive in a later ticket). */
    projectId?: string;
    /** Kind of entity acted upon, e.g. "membership", "profile". */
    targetType?: string;
    /** Id of that entity, when applicable. */
    targetId?: string;
    outcome: AuditOutcome;
    /** Redacted, non-sensitive context. MUST NOT contain secrets or PII. */
    metadata?: Prisma.InputJsonValue;
}

/**
 * Append-only audit writer for sensitive Organization actions (S1-009).
 *
 * `record` performs a SINGLE `prisma.auditEvent.create` — there is no update or
 * delete path anywhere in this service, which is what makes the stream
 * immutable by convention.
 *
 * TRADEOFF — auditing must never break the audited action. `record` therefore
 * NEVER throws into the caller's business path: a failed audit write is caught,
 * logged via the Nest `Logger`, and swallowed. We accept that a lost audit row
 * is preferable to a business operation (e.g. onboarding) failing because the
 * audit insert hiccuped. Callers `await` it purely for ordering; it always
 * resolves.
 */
@Injectable()
export class AuditService {
    private readonly logger = new Logger(AuditService.name);

    async record(event: AuditEventInput): Promise<void> {
        try {
            await prisma.auditEvent.create({
                data: {
                    action: event.action,
                    actorUserId: event.actorUserId,
                    organizationId: event.organizationId,
                    projectId: event.projectId,
                    targetType: event.targetType,
                    targetId: event.targetId,
                    outcome: event.outcome,
                    metadata: event.metadata,
                },
            });
        } catch (error) {
            // Swallow: an audit write failing must not break the audited action.
            this.logger.error(
                `Failed to record audit event "${event.action}" ` +
                    `(outcome=${event.outcome}) for organization ` +
                    `${event.organizationId}`,
                error instanceof Error ? error.stack : String(error),
            );
        }
    }

    /**
     * Read an Organization's audit events, newest first. Paginated/limited so a
     * long-lived tenant's history can't be fetched unbounded. Ordered by the
     * `[organizationId, createdAt]` index.
     */
    async listForOrganization(
        organizationId: string,
        options: { limit?: number; cursor?: string } = {},
    ): Promise<{ events: AuditEvent[]; nextCursor: string | null }> {
        const take = clampLimit(options.limit);
        const events = await prisma.auditEvent.findMany({
            where: { organizationId },
            orderBy: { createdAt: "desc" },
            take: take + 1,
            ...(options.cursor
                ? { cursor: { id: options.cursor }, skip: 1 }
                : {}),
        });

        const hasMore = events.length > take;
        const page = hasMore ? events.slice(0, take) : events;
        return {
            events: page,
            nextCursor: hasMore ? page[page.length - 1].id : null,
        };
    }
}

/** Default and hard-cap page size, so reads are always bounded. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function clampLimit(limit?: number): number {
    if (limit === undefined || !Number.isFinite(limit) || limit <= 0) {
        return DEFAULT_LIMIT;
    }
    return Math.min(Math.floor(limit), MAX_LIMIT);
}

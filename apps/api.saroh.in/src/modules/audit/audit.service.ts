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
    ProductReviewInvite: "product-review.invite",
    ProductReviewReply: "product-review.reply",
    ProductReviewHide: "product-review.hide",
    ProductReviewUnhide: "product-review.unhide",
    // Written by `ModuleLifecycleService` inside its own transaction; listed
    // here so the read can ask for them.
    ModuleEnable: "organization.module.enabled",
    ModuleDisable: "organization.module.disabled",
    PlanChange: "organization.plan.changed",
    StorefrontHoursUpdate: "storefront.hours.update",
    // An untracked product marked Sold out by hand at a storefront, or
    // available again (#515); metadata names the product and storefront.
    ProductSoldOutMark: "product.sold-out.mark",
    ProductSoldOutClear: "product.sold-out.clear",
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
     *
     * `actions` narrows the stream to those actions (Settings › Activity reads
     * only the settings ones, not a review being hidden).
     *
     * Each event carries who did it — and, for a membership or an invitation,
     * who it was about — as they are NOW, with their current role: the row
     * stores bare ids by design, so names and roles are looked up at read
     * time, in one query per kind, never written into the append-only
     * stream. Its `metadata` comes back as recorded: the fields a settings
     * save touched, and for newer saves their values before and after. The reader already holds
     * `audit:read` (Owner/Admin), who see the same names and invited
     * addresses on the Team page.
     */
    async listForOrganization(
        organizationId: string,
        options: {
            limit?: number;
            cursor?: string;
            actions?: readonly AuditAction[];
        } = {},
    ): Promise<{ events: AuditEventView[]; nextCursor: string | null }> {
        const take = clampLimit(options.limit);
        const events = await prisma.auditEvent.findMany({
            where: {
                organizationId,
                ...(options.actions?.length
                    ? { action: { in: [...options.actions] } }
                    : {}),
            },
            orderBy: { createdAt: "desc" },
            take: take + 1,
            ...(options.cursor
                ? { cursor: { id: options.cursor }, skip: 1 }
                : {}),
        });

        const hasMore = events.length > take;
        const page = hasMore ? events.slice(0, take) : events;
        return {
            events: await this.withPeople(organizationId, page),
            nextCursor: hasMore ? page[page.length - 1].id : null,
        };
    }

    /** Name the actor and, where it is a person, the target of each event. */
    private async withPeople(
        organizationId: string,
        events: AuditEvent[],
    ): Promise<AuditEventView[]> {
        if (events.length === 0) return [];
        const userIds = new Set<string>();
        const invitationIds = new Set<string>();
        for (const event of events) {
            userIds.add(event.actorUserId);
            if (event.targetId && event.targetType === "membership") {
                userIds.add(event.targetId);
            }
            if (event.targetId && event.targetType === "invitation") {
                invitationIds.add(event.targetId);
            }
        }
        const [users, memberships, invitations] = await Promise.all([
            prisma.user.findMany({
                where: { id: { in: [...userIds] } },
                select: { id: true, name: true, email: true },
            }),
            // Their role here now — the role key, which the reader names —
            // and none for someone no longer on the team.
            prisma.membership.findMany({
                where: { organizationId, userId: { in: [...userIds] } },
                select: { userId: true, role: true },
            }),
            invitationIds.size > 0
                ? prisma.organizationInvitation.findMany({
                      // Scoped to the org: an id from another tenant names
                      // nobody.
                      where: { id: { in: [...invitationIds] }, organizationId },
                      select: { id: true, email: true },
                  })
                : Promise.resolve([]),
        ]);
        const roles = new Map(memberships.map((m) => [m.userId, m.role]));
        const people = new Map<string, AuditPerson>(
            users.map((u) => [
                u.id,
                { name: u.name, email: u.email, role: roles.get(u.id) ?? null },
            ]),
        );
        for (const invitation of invitations) {
            people.set(invitation.id, {
                name: null,
                email: invitation.email,
                role: null,
            });
        }
        return events.map((event) => ({
            ...event,
            actor: people.get(event.actorUserId) ?? null,
            target:
                event.targetId &&
                (event.targetType === "membership" ||
                    event.targetType === "invitation")
                    ? (people.get(event.targetId) ?? null)
                    : null,
        }));
    }
}

/** A person an event names, as they are now; `null` when they are gone. */
export interface AuditPerson {
    name: string | null;
    email: string;
    /**
     * Their role key in this business now ("ADMIN", or one it invented);
     * null for someone no longer on the team, or an invitation.
     */
    role: string | null;
}

/** An audit row as the read endpoint returns it: the row, and who it names. */
export type AuditEventView = AuditEvent & {
    actor: AuditPerson | null;
    target: AuditPerson | null;
};

const AUDIT_ACTIONS: ReadonlySet<string> = new Set(Object.values(AuditAction));

/**
 * `actions=profile.update,membership.invite` as the typed list; anything
 * that is not an action this stream records is dropped, and nothing left
 * means no filter.
 */
export function parseAuditActions(
    value: string | undefined,
): AuditAction[] | undefined {
    if (!value) return undefined;
    const actions = value
        .split(",")
        .map((a) => a.trim())
        .filter((a): a is AuditAction => AUDIT_ACTIONS.has(a));
    return actions.length > 0 ? actions : undefined;
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

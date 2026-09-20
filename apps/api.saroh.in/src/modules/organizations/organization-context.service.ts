import {
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type {
    OrganizationContext,
    OrgRole,
} from "../../common/types/organization-context";
import { ORG_ROLES } from "../../common/types/organization-context";
import { resolveCapabilities } from "./organization-policy";

/** A user's Organization membership as surfaced to the switcher/list UI. */
export interface UserOrganization {
    id: string;
    name: string;
    slug: string;
    role: OrgRole;
}

/** Minimal Organization identity returned alongside a resolved context. */
export interface OrganizationSummary {
    id: string;
    name: string;
    slug: string;
}

/**
 * Resolves and lists a caller's Organization access (S1-003).
 *
 * This is the one place a raw `(userId, organizationId)` pair is turned into a
 * trustworthy {@link OrganizationContext}. Handlers never query membership
 * themselves; they receive the resolved context (via `OrganizationGuard` +
 * `@OrgContext()`) and defer every decision to `organization-policy.ts`.
 */
@Injectable()
export class OrganizationContextService {
    private readonly logger = new Logger(OrganizationContextService.name);

    /**
     * Resolve the caller's context for one Organization.
     *
     * Error semantics — we split "does not exist" from "not a member":
     *  - Organization row missing            → `NotFoundException` (404).
     *  - Organization exists, no membership   → `ForbiddenException` (403).
     *
     * This distinction is deliberate. The caller is already authenticated (the
     * guard runs after `BetterAuthGuard`), so revealing the bare existence of
     * an org id to a signed-in user is low-risk, while a precise 403 vs 404
     * gives legitimate multi-org clients an actionable signal (e.g. "request
     * access" vs "wrong link"). It costs one extra lookup only on the failure
     * path — the common success path is a single membership read.
     */
    async resolve(
        userId: string,
        organizationId: string,
    ): Promise<OrganizationContext> {
        const membership = await prisma.membership.findUnique({
            where: { organizationId_userId: { organizationId, userId } },
            select: { role: true },
        });

        if (membership) {
            /*
             * The role's own permissions, when the business has stored any.
             *
             * One indexed read on the unique (organizationId, key), on the
             * same path that already reads the membership. A business that
             * has invented nothing has no row, `resolveCapabilities` falls
             * back to the shipped map, and the two reads cost what one did.
             */
            const stored = await prisma.organizationRole.findUnique({
                where: {
                    organizationId_key: {
                        organizationId,
                        key: membership.role,
                    },
                },
                select: { actions: true },
            });

            return {
                organizationId,
                userId,
                role: this.toOrgRole(
                    membership.role,
                    organizationId,
                    stored !== null,
                ),
                roleKey: membership.role,
                actions: resolveCapabilities(membership.role, stored?.actions),
            };
        }

        const organization = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: { id: true },
        });
        if (!organization) {
            throw new NotFoundException("Organization not found");
        }
        throw new ForbiddenException(
            "You are not a member of this organization",
        );
    }

    /** Organizations the user belongs to, with the caller's role, by name. */
    async listForUser(userId: string): Promise<UserOrganization[]> {
        const memberships = await prisma.membership.findMany({
            where: { userId },
            select: {
                role: true,
                organization: { select: { id: true, name: true, slug: true } },
            },
            orderBy: { organization: { name: "asc" } },
        });

        return memberships.map((membership) => ({
            id: membership.organization.id,
            name: membership.organization.name,
            slug: membership.organization.slug,
            role: this.toOrgRole(membership.role, membership.organization.id),
        }));
    }

    /**
     * Identity of an already-authorized Organization. Safe to call without a
     * fresh membership check because the caller passes an id that came from a
     * resolved {@link OrganizationContext} (i.e. access is already proven).
     */
    async getSummary(organizationId: string): Promise<OrganizationSummary> {
        const organization = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: { id: true, name: true, slug: true },
        });
        if (!organization) {
            throw new NotFoundException("Organization not found");
        }
        return organization;
    }

    /**
     * Narrow the free-form `Membership.role` string to a known {@link OrgRole}.
     * An unrecognized value is treated as the least-privileged `MEMBER` (fail
     * closed) and logged, so a bad row can never silently escalate privileges.
     */
    /**
     * The BUILT-IN role a key maps to, for anything still reading a role name.
     *
     * A role the business invented maps to MEMBER — the read-only floor —
     * which is fail-safe rather than tidy, and never the gate: `authorize()`
     * reads the resolved `actions` instead.
     *
     * `recognised` says whether the business actually has this role. Without
     * it every invented role logged "Unknown membership role" on every
     * request, turning a warning that means "a row is wrong" into noise that
     * means "this business uses the feature". A key that matches NOTHING —
     * built-in or stored — is still worth a warning, because that one really
     * is a row nobody can explain.
     */
    private toOrgRole(
        role: string,
        organizationId: string,
        recognised = false,
    ): OrgRole {
        if ((ORG_ROLES as readonly string[]).includes(role)) {
            return role as OrgRole;
        }
        if (!recognised) {
            this.logger.warn(
                `Unknown membership role "${role}" on organization ${organizationId}; treating as MEMBER`,
            );
        }
        return "MEMBER";
    }
}

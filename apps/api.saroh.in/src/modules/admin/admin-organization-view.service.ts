import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { EntitlementMap } from "../billing/entitlement.service";
import { EntitlementService } from "../billing/entitlement.service";
import { MODULES } from "../capabilities/module-registry";

const PANEL_ROWS = 20;

/**
 * One panel of the business page. A panel that failed to load says so and
 * leaves the others standing (plan U4: "panels degrade one at a time").
 */
export type Panel<T> = { status: "ok"; data: T } | { status: "failed" };

export interface OrganizationFacts {
    id: string;
    name: string;
    slug: string;
    createdAt: Date;
    lifecycleStatus: string;
    lifecycleVersion: number;
    suspendedAt: Date | null;
    suspensionReason: string | null;
    deletionScheduledAt: Date | null;
    deletionReason: string | null;
    timezone: string | null;
    country: string | null;
    counts: {
        members: number;
        sites: number;
        orders: number;
        openOrders: number;
        bookings: number;
        contacts: number;
    };
}

export interface OrganizationPerson {
    membershipId: string;
    userId: string;
    name: string | null;
    /** Null unless the caller holds `organization:pii:read`. */
    email: string | null;
    emailVerified: boolean;
    role: string;
}

export interface OrganizationInvite {
    id: string;
    email: string | null;
    role: string;
    status: string;
    expiresAt: Date;
    createdAt: Date;
}

export interface OrganizationModuleRow {
    key: string;
    label: string;
    status: "ENABLED" | "DISABLED" | "ARCHIVED" | "NOT_INSTALLED";
    dependencies: readonly string[];
}

export interface OrganizationPlan {
    subscription: {
        status: string;
        plan: { id: string; key: string; name: string; version: number };
        currentPeriodEnd: Date | null;
        cancelAtPeriodEnd: boolean;
    } | null;
    limits: {
        key: string;
        /** What the plan (or the free floor) grants. */
        planValue: number | boolean | null;
        /** What applies now, after any live override. */
        effective: number | boolean | null;
        /** How many are in use, where the instance can count them. */
        usage: number | null;
        override: { id: string; value: number; expiresAt: Date } | null;
    }[];
}

export interface OrganizationActivityRow {
    id: string;
    action: string;
    actorUserId: string;
    /** Who, in words: a name, an email to a PII reader, or null if unknown. */
    actor: string | null;
    targetType: string | null;
    outcome: string;
    createdAt: Date;
}

export interface OperatorActionRow {
    id: string;
    action: string;
    actorUserId: string;
    actor: string | null;
    reason: string | null;
    outcome: string;
    createdAt: Date;
}

export interface OperatorNote {
    id: string;
    authorUserId: string;
    author: string | null;
    body: string;
    createdAt: Date;
}

export interface OrganizationSupportView {
    facts: OrganizationFacts;
    people: Panel<{
        members: OrganizationPerson[];
        invitations: OrganizationInvite[];
    }>;
    modules: Panel<OrganizationModuleRow[]>;
    plan: Panel<OrganizationPlan>;
    activity: Panel<OrganizationActivityRow[]>;
    operatorActions: Panel<OperatorActionRow[]>;
    notes: Panel<OperatorNote[]>;
}

/**
 * The business page (admin console U4) — the per-tenant support read.
 *
 * Reaching it requires an open, reason-bound, read-only access session
 * (`OrganizationAccessSessionGuard`), and every read is written to the admin
 * ledger by the controller. That is what separates it from the directory,
 * which reads across every business and returns only what decides whether
 * to open one.
 *
 * What it shows was a product decision (the console plan, R10): the
 * business's facts and lifecycle, its people and their roles, its modules, its
 * plan and limits with usage, its recent activity, the operator actions taken
 * on it, and operator notes. It still returns no customer, contact, order
 * line, message or site body — the business's own customers are not what a
 * support conversation is about. People's email addresses are personal data
 * and come back only to a caller holding `organization:pii:read`.
 *
 * The two ledgers stay separate (plan D5): `activity` is what the business
 * did, `operatorActions` is what an operator did to it.
 */
@Injectable()
export class AdminOrganizationViewService {
    private readonly logger = new Logger(AdminOrganizationViewService.name);

    constructor(private readonly entitlements: EntitlementService) {}

    async view(
        organizationId: string,
        caller: { canReadPii: boolean },
    ): Promise<OrganizationSupportView> {
        const facts = await this.facts(organizationId);

        const [people, modules, plan, activity, operatorActions, notes] =
            await Promise.all([
                this.panel("people", () =>
                    this.people(organizationId, caller.canReadPii),
                ),
                this.panel("modules", () => this.modules(organizationId)),
                this.panel("plan", () =>
                    this.plan(organizationId, facts.counts),
                ),
                this.panel("activity", () =>
                    this.named(this.activity(organizationId), caller),
                ),
                this.panel("operatorActions", () =>
                    this.named(this.operatorActions(organizationId), caller),
                ),
                this.panel("notes", async () => {
                    const rows = await this.notes(organizationId);
                    const names = await this.names(
                        rows.map((row) => row.authorUserId),
                        caller,
                    );
                    return rows.map((row) => ({
                        ...row,
                        author: names.get(row.authorUserId) ?? null,
                    }));
                }),
            ]);

        return {
            facts,
            people,
            modules,
            plan,
            activity,
            operatorActions,
            notes,
        };
    }

    /** Add who did each thing, in words, to a list keyed by `actorUserId`. */
    private async named<T extends { actorUserId: string }>(
        rows: Promise<T[]>,
        caller: { canReadPii: boolean },
    ): Promise<(T & { actor: string | null })[]> {
        const list = await rows;
        const names = await this.names(
            list.map((row) => row.actorUserId),
            caller,
        );
        return list.map((row) => ({
            ...row,
            actor: names.get(row.actorUserId) ?? null,
        }));
    }

    /**
     * Names for a set of user ids, in one read. A person's name when they
     * gave one; their email only to a caller who may read personal data.
     * System actors (`system:…`) have no row and come back unnamed.
     */
    private async names(
        userIds: string[],
        caller: { canReadPii: boolean },
    ): Promise<Map<string, string>> {
        const ids = [...new Set(userIds)].filter((id) => !id.includes(":"));
        if (ids.length === 0) return new Map();
        const users = await prisma.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true, email: true },
        });
        const out = new Map<string, string>();
        for (const user of users) {
            const label = user.name ?? (caller.canReadPii ? user.email : null);
            if (label) out.set(user.id, label);
        }
        return out;
    }

    private async panel<T>(
        name: string,
        load: () => Promise<T>,
    ): Promise<Panel<T>> {
        try {
            return { status: "ok", data: await load() };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            this.logger.error(
                `Business page panel "${name}" failed: ${message}`,
            );
            return { status: "failed" };
        }
    }

    private async facts(organizationId: string): Promise<OrganizationFacts> {
        const organization = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: {
                id: true,
                name: true,
                slug: true,
                createdAt: true,
                lifecycleStatus: true,
                lifecycleVersion: true,
                suspendedAt: true,
                suspensionReason: true,
                deletionScheduledAt: true,
                deletionReason: true,
                businessProfile: { select: { timezone: true, country: true } },
            },
        });
        if (!organization) {
            throw new NotFoundException("Organization not found");
        }

        const where = { organizationId };
        const [members, sites, orders, openOrders, bookings, contacts] =
            await Promise.all([
                prisma.membership.count({ where }),
                prisma.site.count({ where }),
                prisma.order.count({ where }),
                prisma.order.count({
                    where: {
                        ...where,
                        status: { in: ["PENDING", "PROCESSING"] },
                    },
                }),
                prisma.booking.count({ where }),
                prisma.contact.count({ where }),
            ]);

        const { businessProfile, ...rest } = organization;
        return {
            ...rest,
            timezone: businessProfile?.timezone ?? null,
            country: businessProfile?.country ?? null,
            counts: { members, sites, orders, openOrders, bookings, contacts },
        };
    }

    private async people(organizationId: string, canReadPii: boolean) {
        const [memberships, invitations] = await Promise.all([
            prisma.membership.findMany({
                where: { organizationId },
                select: {
                    id: true,
                    role: true,
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            emailVerified: true,
                        },
                    },
                },
                orderBy: { id: "asc" },
            }),
            prisma.organizationInvitation.findMany({
                where: { organizationId, status: "PENDING" },
                select: {
                    id: true,
                    email: true,
                    role: true,
                    status: true,
                    expiresAt: true,
                    createdAt: true,
                },
                orderBy: { createdAt: "desc" },
            }),
        ]);

        return {
            members: memberships.map((row) => ({
                membershipId: row.id,
                userId: row.user.id,
                name: row.user.name,
                email: canReadPii ? row.user.email : null,
                emailVerified: row.user.emailVerified,
                role: row.role,
            })),
            invitations: invitations.map((row) => ({
                ...row,
                email: canReadPii ? row.email : null,
            })),
        };
    }

    private async modules(
        organizationId: string,
    ): Promise<OrganizationModuleRow[]> {
        const rows = await prisma.organizationModule.findMany({
            where: { organizationId },
            select: { moduleKey: true, status: true },
        });
        const status = new Map(rows.map((row) => [row.moduleKey, row.status]));

        return MODULES.map((module) => ({
            key: module.key,
            label: module.label,
            status: (status.get(module.key) ??
                "NOT_INSTALLED") as OrganizationModuleRow["status"],
            dependencies: module.dependencies,
        }));
    }

    private async plan(
        organizationId: string,
        counts: OrganizationFacts["counts"],
    ): Promise<OrganizationPlan> {
        const [subscription, planValues, effective, overrides] =
            await Promise.all([
                prisma.subscription.findUnique({
                    where: { organizationId },
                    select: {
                        status: true,
                        currentPeriodEnd: true,
                        cancelAtPeriodEnd: true,
                        plan: {
                            select: {
                                id: true,
                                key: true,
                                name: true,
                                version: true,
                            },
                        },
                    },
                }),
                this.entitlements.getPlanEntitlements(organizationId),
                this.entitlements.getEntitlements(organizationId),
                this.entitlements.liveOverrides(organizationId),
            ]);

        // Usage the instance can count. A limit whose usage nobody measures
        // says so (null) rather than showing zero.
        const usage: Record<string, number> = {
            sites: counts.sites,
            teamMembers: counts.members,
        };

        const keys = new Set([
            ...Object.keys(planValues),
            ...Object.keys(effective),
        ]);

        return {
            subscription,
            limits: [...keys].sort().map((key) => {
                const override = overrides.find((row) => row.key === key);
                return {
                    key,
                    planValue: pick(planValues, key),
                    effective: pick(effective, key),
                    usage: usage[key] ?? null,
                    override: override
                        ? {
                              id: override.id,
                              value: override.value,
                              expiresAt: override.expiresAt,
                          }
                        : null,
                };
            }),
        };
    }

    private activity(organizationId: string) {
        return prisma.auditEvent.findMany({
            where: { organizationId },
            select: {
                id: true,
                action: true,
                actorUserId: true,
                targetType: true,
                outcome: true,
                createdAt: true,
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: PANEL_ROWS,
        });
    }

    private operatorActions(organizationId: string) {
        return prisma.adminAuditEvent.findMany({
            // Actions, not page views: every read under a support session is
            // in the trail, and listing them here would bury the changes.
            where: {
                organizationId,
                action: { not: "organization.access.read" },
            },
            select: {
                id: true,
                action: true,
                actorUserId: true,
                reason: true,
                outcome: true,
                createdAt: true,
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: PANEL_ROWS,
        });
    }

    private notes(organizationId: string) {
        return prisma.adminOrganizationNote.findMany({
            where: { organizationId },
            select: {
                id: true,
                authorUserId: true,
                body: true,
                createdAt: true,
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: PANEL_ROWS,
        });
    }
}

function pick(map: EntitlementMap, key: string): number | boolean | null {
    return key in map ? map[key] : null;
}

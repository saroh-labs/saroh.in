import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { liveCatalogueVersion, prisma } from "@saroh/database";
import type { LimitPeriod } from "@saroh/pricing-catalog";
import { MODULE_MAP, validateCatalog } from "@saroh/pricing-catalog";

import type { Term } from "../billing/billing-term";
import { mapEntry } from "../billing/catalogue-access";
import type { BusinessAccess } from "../billing/catalogue-access.service";
import { CatalogueAccessService } from "../billing/catalogue-access.service";
import type { NextChargeHow } from "./admin-billing";
import { nextChargeOf } from "./admin-billing";
import { subscriptionTerms } from "./admin-billing-terms";
import { AdminBusinessModulesService } from "./admin-business-modules.service";
import type { Panel } from "./admin-organization-view.service";
import type { OrganizationPresence } from "./admin-presence";
import { organizationPresence } from "./admin-presence";
import type { UsageNote } from "./catalogue-usage";
import { catalogueUsage, usageNote } from "./catalogue-usage";
import type { EffectivePlan } from "./effective-plan";
import { effectivePlan } from "./effective-plan";

/** How many lines Recent activity shows. */
export const OVERVIEW_ACTIVITY_ROWS = 8;

/** One running offer or override, without the operator's reason. */
export interface OverviewOffer {
    id: string;
    /** `plan` | `price` | `grant` | `remove` | `limit` | `raise` … */
    kind: string;
    /** The catalogue row, plan or entitlement key it is about. */
    moduleKey: string | null;
    planKey: string | null;
    key: string;
    value: number | null;
    /** Null lasts until someone removes it. */
    expiresAt: Date | null;
}

export interface OverviewPlan {
    /**
     * Its Saroh subscription, for the Billing tab's link to the
     * subscription sheet (U5); null with none. An id, never a detail.
     */
    subscriptionId: string | null;
    /** On the catalogue: the plan now, a plan override winning. */
    effective: EffectivePlan | null;
    /** The plan's name now, on or off the catalogue; null with no plan. */
    name: string | null;
    /** The subscription's plan, before any plan override. */
    basePlanName: string | null;
    /** When the plan override ends; null with none or none set. */
    overrideEndsAt: Date | null;
    /** The subscription's status; null with none (the free basics). */
    status: string | null;
    /** What it pays a month before GST (paise): a custom price, else its plan's. */
    pricePaise: number | null;
    /** Its plan's own price (paise), to tell a custom price from it. */
    planPricePaise: number | null;
    customPrice: { pricePaise: number; expiresAt: Date | null } | null;
    nextCharge: {
        at: Date | null;
        how: NextChargeHow;
        autopayRunsOutSoon: boolean;
    };
    /** Every live offer and override, newest first, without reasons. */
    offers: OverviewOffer[];
    /**
     * The live catalogue's plans, for Put on a plan…; null while none is
     * live. Plan names, never a price.
     */
    livePlans: { id: string; name: string }[] | null;
}

/** One limit and how much of it is in use. */
export interface OverviewUsageRow {
    /** The catalogue row id, or the entitlement key off the catalogue. */
    key: string;
    label: string;
    used: number | null;
    /** What applies now; null for no cap. */
    limit: number | null;
    /** Its plan's own cap, before overrides. */
    planLimit: number | null;
    per: LimitPeriod;
    soft: boolean;
    /** Used beyond the limit (a soft cap lets that happen). */
    over: boolean;
    /** Raised or set for this business, and until when (null: until removed). */
    changed: { expiresAt: Date | null } | null;
    note: UsageNote | null;
    /** An operator may raise it for a while (`POST …/limits`). */
    raisable: boolean;
}

export interface OverviewModules {
    on: number;
    off: number;
    locked: number;
    total: number;
    planLimitsEnforced: boolean;
    /** "Plan limits not enforced yet", once; null while they are. */
    note: string | null;
}

export interface OverviewWebsite {
    sites: OrganizationPresence["sites"];
    payments: OrganizationPresence["payments"];
    published: number;
    paymentsConnected: boolean;
}

export interface OverviewTeam {
    /** Names and roles only: never an email (no support session here). */
    members: { name: string | null; role: string }[];
    count: number;
    invitesOpen: number;
}

/** What happened, and when: never who wrote what or why. */
export interface OverviewActivityRow {
    id: string;
    /** `business`: the business did it; `operator`: staff did it to it. */
    source: "business" | "operator";
    action: string;
    at: Date;
}

export interface OverviewBadges {
    /** Open billing actions on the business: Billing "needs you". */
    billing: { needsYou: boolean; count: number };
    modules: { count: number } | null;
    team: { count: number } | null;
    notes: { count: number } | null;
}

/**
 * A business's Overview (admin plan U3, #991): one read, with no support
 * session and no personal data, so Operations, Billing and Release staff
 * see it as Support does.
 *
 * What keeps it free of personal data (plan KTD "Reads without a support
 * session"): team members by name and role, never an email; activity as
 * action and time, never a reason or who; notes as a count and a date,
 * never their text; offers without the operator's reason. Who it is
 * billed to is a legal name, shown only to `saroh-billing:read` holders.
 */
export interface OrganizationOverview {
    organizationId: string;
    plan: Panel<OverviewPlan>;
    /**
     * Null: the caller may not see who pays. `name` null: no billing
     * profile yet, so they choose one at their first payment.
     */
    billedTo: { name: string | null } | null;
    usage: Panel<OverviewUsageRow[]>;
    modules: Panel<OverviewModules>;
    website: Panel<OverviewWebsite>;
    team: Panel<OverviewTeam>;
    activity: Panel<OverviewActivityRow[]>;
    notes: Panel<{ count: number; lastAt: Date | null }>;
    badges: OverviewBadges;
}

/**
 * CROSS-TENANT READ, behind the admin guards and `organization:read`, for
 * the one business in the path, scoped by `scopeForStaff` in the
 * controller. Each card degrades on its own.
 */
@Injectable()
export class AdminOrganizationOverviewService {
    private readonly logger = new Logger(AdminOrganizationOverviewService.name);

    constructor(
        private readonly access: CatalogueAccessService,
        private readonly businessModules: AdminBusinessModulesService,
    ) {}

    async overview(
        organizationId: string,
        caller: { canReadBilling: boolean },
    ): Promise<OrganizationOverview> {
        const org = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: {
                id: true,
                billingProfile: caller.canReadBilling
                    ? { select: { legalName: true } }
                    : false,
            },
        });
        if (!org) throw new NotFoundException("Business not found");

        const now = new Date();
        // One resolve for the plan and usage cards.
        const access = this.access.resolve(organizationId, now);
        // Don't let a failure here reject before a card catches it.
        access.catch(() => undefined);

        const [plan, usage, modules, website, team, activity, notes, open] =
            await Promise.all([
                this.panel("plan", async () =>
                    this.plan(organizationId, await access, now),
                ),
                this.panel("usage", async () =>
                    this.usage(organizationId, await access, now),
                ),
                this.panel("modules", () => this.modules(organizationId)),
                this.panel("website", () => this.website(organizationId)),
                this.panel("team", () => this.team(organizationId)),
                this.panel("activity", () => this.activity(organizationId)),
                this.panel("notes", () => this.notes(organizationId)),
                prisma.billingAction
                    .count({ where: { organizationId, resolvedAt: null } })
                    .catch(() => 0),
            ]);

        return {
            organizationId,
            plan,
            billedTo: caller.canReadBilling
                ? { name: org.billingProfile?.legalName ?? null }
                : null,
            usage,
            modules,
            website,
            team,
            activity,
            notes,
            badges: {
                billing: { needsYou: open > 0, count: open },
                modules:
                    modules.status === "ok" ? { count: modules.data.on } : null,
                team: team.status === "ok" ? { count: team.data.count } : null,
                notes:
                    notes.status === "ok" ? { count: notes.data.count } : null,
            },
        };
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
            this.logger.error(`Overview card "${name}" failed: ${message}`);
            return { status: "failed" };
        }
    }

    private async plan(
        organizationId: string,
        access: BusinessAccess,
        now: Date,
    ): Promise<OverviewPlan> {
        const [subscription, rows, live] = await Promise.all([
            prisma.subscription.findUnique({
                where: { organizationId },
                select: {
                    id: true,
                    status: true,
                    provider: true,
                    providerSubscriptionId: true,
                    currentPeriodEnd: true,
                    cancelAtPeriodEnd: true,
                    billingCycle: true,
                    plan: { select: { name: true, priceCents: true } },
                },
            }),
            prisma.entitlementOverride.findMany({
                where: {
                    organizationId,
                    revokedAt: null,
                    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                },
                // Never `reason`: it is the operator's own words.
                select: {
                    id: true,
                    kind: true,
                    key: true,
                    moduleKey: true,
                    planKey: true,
                    value: true,
                    expiresAt: true,
                },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            }),
            liveCatalogueVersion(prisma, now),
        ]);

        const terms = subscription
            ? await subscriptionTerms(prisma, [subscription], now)
            : new Map<string, Term>();
        const next = subscription
            ? nextChargeOf(
                  subscription,
                  terms.get(subscription.id) ?? null,
                  now,
              )
            : null;

        const effective = effectivePlan(access);
        const price = rows.find((r) => r.kind === "price");
        const catalogue = access.source === "catalogue" ? access : null;

        return {
            subscriptionId: subscription?.id ?? null,
            effective,
            name: effective?.name ?? subscription?.plan.name ?? null,
            basePlanName:
                effective?.basePlanName ?? subscription?.plan.name ?? null,
            overrideEndsAt: effective?.override?.expiresAt ?? null,
            status: subscription?.status ?? null,
            pricePaise: catalogue
                ? catalogue.pricePaise
                : (subscription?.plan.priceCents ?? null),
            planPricePaise: catalogue
                ? (catalogue.catalog.plans.find(
                      (p) => p.id === catalogue.planId,
                  )?.pricePaise ?? null)
                : (subscription?.plan.priceCents ?? null),
            customPrice:
                price && price.value !== null
                    ? { pricePaise: price.value, expiresAt: price.expiresAt }
                    : null,
            nextCharge: {
                at: next?.nextChargeAt ?? null,
                how: next?.nextChargeHow ?? "NONE",
                autopayRunsOutSoon: next?.autopayRunsOutSoon ?? false,
            },
            offers: rows,
            livePlans: livePlans(access, live),
        };
    }

    private async usage(
        organizationId: string,
        access: BusinessAccess,
        now: Date,
    ): Promise<OverviewUsageRow[]> {
        const [metered, changes] = await Promise.all([
            catalogueUsage(organizationId, Object.keys(MODULE_MAP), now),
            prisma.entitlementOverride.findMany({
                where: {
                    organizationId,
                    revokedAt: null,
                    kind: { in: ["raise", "limit"] },
                    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                },
                select: { key: true, moduleKey: true, expiresAt: true },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            }),
        ]);
        const { usage, storefronts } = metered;
        const changeOf = (key: string) => {
            const row = changes.find(
                (c) => c.key === key || c.moduleKey === key,
            );
            return row ? { expiresAt: row.expiresAt } : null;
        };

        if (access.source === "catalogue") {
            return access.modules.flatMap((m): OverviewUsageRow[] => {
                if (m.state !== "on") return [];
                const used: number | null =
                    m.moduleId in usage ? usage[m.moduleId] : null;
                const limit = m.limit;
                // A row with no cap and no count says nothing on Overview.
                if (limit === null && used === null) return [];
                const planLimit = planLimitOf(access, m.moduleId);
                return [
                    {
                        key: m.moduleId,
                        label: m.name,
                        used,
                        limit,
                        planLimit,
                        per: m.per,
                        soft: m.soft,
                        over: used !== null && limit !== null && used > limit,
                        changed: changeOf(m.moduleId),
                        note: usageNote(m.moduleId, used, storefronts),
                        raisable:
                            planLimit !== null &&
                            Boolean(mapEntry(m.moduleId)?.limitKey),
                    },
                ];
            });
        }

        // Off the catalogue: the numeric limits its plan (or the free floor)
        // sets, with the counts the instance can make.
        const [sites, members] = await Promise.all([
            prisma.site.count({ where: { organizationId, deletedAt: null } }),
            prisma.membership.count({ where: { organizationId } }),
        ]);
        const counted: Record<string, number> = {
            sites,
            teamMembers: members,
            storefronts: "locations" in usage ? usage.locations : 0,
        };
        return Object.keys(access.planEntitlements)
            .sort()
            .flatMap((key): OverviewUsageRow[] => {
                const planValue = access.planEntitlements[key];
                const value = access.entitlements[key];
                if (typeof planValue !== "number") return [];
                const limit = typeof value === "number" ? value : planValue;
                const used: number | null =
                    key in counted ? counted[key] : null;
                return [
                    {
                        key,
                        label: key,
                        used,
                        limit,
                        planLimit: planValue,
                        per: "",
                        soft: false,
                        over: used !== null && used > limit,
                        changed: changeOf(key),
                        note: null,
                        raisable: true,
                    },
                ];
            });
    }

    private async modules(organizationId: string): Promise<OverviewModules> {
        const state = await this.businessModules.state(organizationId);
        const count = (word: "on" | "off" | "locked") =>
            state.modules.filter((m) => m.state === word).length;
        return {
            on: count("on"),
            off: count("off"),
            locked: count("locked"),
            total: state.modules.length,
            planLimitsEnforced: state.planLimitsEnforced,
            note: state.note,
        };
    }

    private async website(organizationId: string): Promise<OverviewWebsite> {
        const presence = await organizationPresence(organizationId);
        return {
            sites: presence.sites,
            payments: presence.payments,
            published: presence.sites.filter((s) => s.published).length,
            paymentsConnected: presence.payments.some((p) => p.connected),
        };
    }

    private async team(organizationId: string): Promise<OverviewTeam> {
        const [members, invitesOpen] = await Promise.all([
            prisma.membership.findMany({
                where: { organizationId },
                // A name and a role. Never `email`.
                select: { role: true, user: { select: { name: true } } },
                orderBy: { id: "asc" },
            }),
            prisma.organizationInvitation.count({
                where: { organizationId, status: "PENDING" },
            }),
        ]);
        return {
            members: members.map((m) => ({
                name: m.user.name,
                role: m.role,
            })),
            count: members.length,
            invitesOpen,
        };
    }

    private async activity(
        organizationId: string,
    ): Promise<OverviewActivityRow[]> {
        const [business, operator] = await Promise.all([
            prisma.auditEvent.findMany({
                where: { organizationId },
                select: { id: true, action: true, createdAt: true },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take: OVERVIEW_ACTIVITY_ROWS,
            }),
            prisma.adminAuditEvent.findMany({
                // Changes, not page views; never the reason.
                where: {
                    organizationId,
                    action: { not: "organization.access.read" },
                },
                select: { id: true, action: true, createdAt: true },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take: OVERVIEW_ACTIVITY_ROWS,
            }),
        ]);
        return [
            ...business.map((r) => ({
                id: r.id,
                source: "business" as const,
                action: r.action,
                at: r.createdAt,
            })),
            ...operator.map((r) => ({
                id: r.id,
                source: "operator" as const,
                action: r.action,
                at: r.createdAt,
            })),
        ]
            .sort((a, b) => b.at.getTime() - a.at.getTime())
            .slice(0, OVERVIEW_ACTIVITY_ROWS);
    }

    private async notes(
        organizationId: string,
    ): Promise<{ count: number; lastAt: Date | null }> {
        const result = await prisma.adminOrganizationNote.aggregate({
            where: { organizationId },
            _count: { _all: true },
            _max: { createdAt: true },
        });
        return {
            count: result._count._all,
            lastAt: result._max.createdAt ?? null,
        };
    }
}

/** A catalogue row's cap on the business's own plan, before overrides. */
function planLimitOf(
    access: Extract<BusinessAccess, { source: "catalogue" }>,
    moduleId: string,
): number | null {
    const row = access.catalog.modules.find((m) => m.id === moduleId);
    const cell = row?.cells[access.planId];
    return cell && cell.inc && typeof cell.limit === "number"
        ? cell.limit
        : null;
}

/** The live version's plans, or null when none is live or it won't read. */
function livePlans(
    access: BusinessAccess,
    live: { version: number; catalog: unknown } | null,
): { id: string; name: string }[] | null {
    if (!live) return null;
    if (access.source === "catalogue" && access.version === live.version) {
        return access.catalog.plans.map((p) => ({ id: p.id, name: p.name }));
    }
    const r = validateCatalog(live.catalog);
    return r.ok
        ? r.catalog.plans.map((p) => ({ id: p.id, name: p.name }))
        : null;
}

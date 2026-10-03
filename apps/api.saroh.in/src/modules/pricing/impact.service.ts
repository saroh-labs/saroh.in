import { Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";
import type { Override, OverrideKind } from "@saroh/pricing-catalog";
import {
    CATALOG_PLAN_KEY_PREFIX,
    catalogPlanIdForKey,
    effectivePlanId,
    MODULE_MAP,
    monthlyEquivalentPaise,
    priceOverridePaise,
} from "@saroh/pricing-catalog";

import type { Catalog } from "@saroh/pricing-catalog";

import type { CatalogueBusiness, Impact } from "./impact";
import { catalogueImpact } from "./impact";

/** Subscriptions that are being charged for their plan. */
const PAYING_STATUSES = new Set(["ACTIVE", "PAST_DUE"]);

/**
 * The metered counts the API can take today, by `MODULE_MAP` limit key.
 * KTD-9's monthly windows (orders and bookings this month, in the business's
 * time zone), blog posts and integrations come with metering (U13); until
 * then those modules read as not counted, and the admin hides their line.
 */
const COUNTED_LIMIT_KEYS = ["products", "teamMembers"] as const;

/** The catalogue modules whose usage {@link ImpactService} counts. */
export const MEASURED_MODULES: ReadonlySet<string> = new Set(
    Object.entries(MODULE_MAP)
        .filter(([, e]) =>
            (COUNTED_LIMIT_KEYS as readonly (string | null)[]).includes(
                e.limitKey,
            ),
        )
        .map(([id]) => id),
);

export interface CatalogueBusinesses {
    businesses: CatalogueBusiness[];
    measured: ReadonlySet<string>;
    /** Subscriptions with a pending move, by the catalogue version moved to. */
    movingTo: ReadonlyMap<number, number>;
}

/**
 * Every business as the catalogue sees it: its plan, the version it is on,
 * what it pays, and how much it uses — the input to the admin's counts,
 * usage lines and impact (plans catalogue U3).
 *
 * CROSS-TENANT READ, behind the admin guards and `pricing:read` only. It
 * returns what decides a pricing change — a business's name, plan and
 * counts — never its customers, orders or messages, and no personal data.
 * A business being deleted (`DELETED_RETAINED`) is left out.
 */
@Injectable()
export class ImpactService {
    async read(
        knownPlanIds: ReadonlySet<string>,
        now: Date,
    ): Promise<CatalogueBusinesses> {
        const [orgs, subs, overrides, products, members, invites] =
            await Promise.all([
                prisma.organization.findMany({
                    where: { lifecycleStatus: { not: "DELETED_RETAINED" } },
                    select: { id: true, name: true },
                    orderBy: { createdAt: "asc" },
                }),
                prisma.subscription.findMany({
                    select: {
                        organizationId: true,
                        status: true,
                        plan: {
                            select: {
                                key: true,
                                version: true,
                                interval: true,
                                priceCents: true,
                            },
                        },
                        pendingPlan: { select: { key: true, version: true } },
                    },
                }),
                prisma.entitlementOverride.findMany({
                    where: {
                        kind: { in: ["plan", "price"] },
                        revokedAt: null,
                        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                    },
                    select: {
                        organizationId: true,
                        kind: true,
                        key: true,
                        value: true,
                        planKey: true,
                        moduleKey: true,
                        createdAt: true,
                        expiresAt: true,
                        revokedAt: true,
                    },
                }),
                prisma.product.groupBy({
                    by: ["organizationId"],
                    where: { status: { not: "ARCHIVED" } },
                    _count: { _all: true },
                }),
                prisma.membership.groupBy({
                    by: ["organizationId"],
                    _count: { _all: true },
                }),
                prisma.organizationInvitation.groupBy({
                    by: ["organizationId"],
                    where: { status: "PENDING", expiresAt: { gt: now } },
                    _count: { _all: true },
                }),
            ]);

        const subOf = new Map(subs.map((s) => [s.organizationId, s]));
        const overridesOf = new Map<string, Override[]>();
        for (const o of overrides) {
            const list = overridesOf.get(o.organizationId) ?? [];
            list.push({ ...o, kind: o.kind as OverrideKind });
            overridesOf.set(o.organizationId, list);
        }
        const count = (
            rows: { organizationId: string; _count: { _all: number } }[],
        ) => new Map(rows.map((r) => [r.organizationId, r._count._all]));
        const productsOf = count(products);
        const membersOf = count(members);
        const invitesOf = count(invites);
        const usageKey = (limitKey: string): string | undefined =>
            Object.entries(MODULE_MAP).find(
                ([, e]) => e.limitKey === limitKey,
            )?.[0];
        const productsModule = usageKey("products");
        const membersModule = usageKey("teamMembers");

        const fallbackPlanId = catalogPlanIdForKey("free") ?? "free";
        const businesses = orgs.map((org): CatalogueBusiness => {
            const sub = subOf.get(org.id);
            const own = overridesOf.get(org.id) ?? [];
            const basePlanId =
                (sub && catalogPlanIdForKey(sub.plan.key)) ?? fallbackPlanId;
            const planId = effectivePlanId(basePlanId, own, now, knownPlanIds);
            const cycle = sub?.plan.interval === "year" ? "year" : "month";
            const paying =
                !!sub &&
                PAYING_STATUSES.has(sub.status) &&
                sub.plan.priceCents > 0;
            const custom = priceOverridePaise(own, now);
            const planMonthly = paying
                ? cycle === "year"
                    ? monthlyEquivalentPaise(sub.plan.priceCents)
                    : sub.plan.priceCents
                : 0;
            const usage: Record<string, number> = {};
            if (productsModule)
                usage[productsModule] = productsOf.get(org.id) ?? 0;
            if (membersModule) {
                usage[membersModule] =
                    (membersOf.get(org.id) ?? 0) + (invitesOf.get(org.id) ?? 0);
            }
            return {
                id: org.id,
                name: org.name,
                planId,
                version: sub?.plan.key.startsWith(CATALOG_PLAN_KEY_PREFIX)
                    ? sub.plan.version
                    : null,
                paying,
                cycle,
                currentPaise: custom ?? planMonthly,
                ownPrice: custom !== null,
                usage,
            };
        });

        const movingTo = new Map<number, number>();
        for (const s of subs) {
            const p = s.pendingPlan;
            if (!p?.key.startsWith(CATALOG_PLAN_KEY_PREFIX)) continue;
            movingTo.set(p.version, (movingTo.get(p.version) ?? 0) + 1);
        }

        return { businesses, measured: MEASURED_MODULES, movingTo };
    }

    /** What publishing `next` over `live` would do, from today's businesses. */
    async impactOf(live: Catalog, next: Catalog, now: Date): Promise<Impact> {
        const known = new Set([
            ...live.plans.map((p) => p.id),
            ...next.plans.map((p) => p.id),
        ]);
        const { businesses, measured } = await this.read(known, now);
        return catalogueImpact({ live, next, businesses, measured });
    }
}

import { Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";
import type { Override, OverrideKind } from "@saroh/pricing-catalog";
import {
    CATALOG_PLAN_KEY_PREFIX,
    catalogPlanIdForKey,
    effectivePlanId,
    monthlyEquivalentPaise,
    priceOverridePaise,
} from "@saroh/pricing-catalog";

import type { Catalog } from "@saroh/pricing-catalog";

import { meteredModules } from "../billing/metering";
import { countUsageAcross } from "../billing/metering-across";
import type { CatalogueBusiness, Impact } from "./impact";
import { catalogueImpact } from "./impact";

/** Subscriptions that are being charged for their plan. */
const PAYING_STATUSES = new Set(["ACTIVE", "PAST_DUE"]);

/**
 * The catalogue modules whose usage {@link ImpactService} counts: every row
 * metering counts (U13, `billing/metering.ts`) — products, orders and
 * bookings this month in each business's zone, blog posts, team members and
 * integrations. The admin's usage lines, its impact and the merchant's
 * `GET …/billing/access` count the same way.
 */
export const MEASURED_MODULES: ReadonlySet<string> = new Set(
    meteredModules().keys(),
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
        const [orgs, subs, overrides] = await Promise.all([
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
        ]);
        const usageOf = await this.usage(
            orgs.map((o) => o.id),
            now,
        );

        const subOf = new Map(subs.map((s) => [s.organizationId, s]));
        const overridesOf = new Map<string, Override[]>();
        for (const o of overrides) {
            const list = overridesOf.get(o.organizationId) ?? [];
            list.push({ ...o, kind: o.kind as OverrideKind });
            overridesOf.set(o.organizationId, list);
        }
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
            for (const [moduleId, counts] of usageOf) {
                usage[moduleId] = counts.get(org.id) ?? 0;
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

    /**
     * Each measured row's count for every business (row id → business id →
     * count). CROSS-TENANT READ, as {@link read} is.
     */
    private async usage(
        organizationIds: readonly string[],
        now: Date,
    ): Promise<Map<string, Map<string, number>>> {
        const rows = [...meteredModules()];
        const counts = await Promise.all(
            rows.map(([, key]) =>
                countUsageAcross(prisma, key, organizationIds, now),
            ),
        );
        return new Map(rows.map(([moduleId], i) => [moduleId, counts[i]]));
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

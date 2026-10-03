import { Injectable, NotFoundException } from "@nestjs/common";
import type { Plan } from "@saroh/database";
import { liveCatalogueVersion, prisma } from "@saroh/database";
import type { BillingCycle } from "@saroh/pricing-catalog";
import { catalogPlanKey } from "@saroh/pricing-catalog";

/**
 * Pricing catalogue `Plan` rows (`catalog.<plan>`, plan 2026-09-29 U1) are
 * not offered through this legacy path: a merchant moves onto the catalogue
 * through its own checkout (U15, `resolveCatalogue` below), never through
 * `listActive` or `resolveActiveByKey`.
 */
export const NOT_CATALOGUE_PLAN = {
    key: { not: { startsWith: "catalog." } },
} as const;

/**
 * The Saroh plan catalog (S7-005).
 *
 * `Plan` is a GLOBAL catalog (NOT org-owned): every tenant is offered the same
 * plans, so reads need only an authenticated session (no OrganizationContext).
 * Only `active` plans are offerable to NEW subscribers; a plan version is
 * immutable, so `resolveActiveByKey` picks the LATEST active version for a key
 * (existing subscribers keep the version they signed up under, resolved via
 * their stored `planId`).
 */
@Injectable()
export class PlansService {
    /** All active plans, cheapest first — the offerable catalog. */
    listActive(): Promise<Plan[]> {
        return prisma.plan.findMany({
            where: { active: true, ...NOT_CATALOGUE_PLAN },
            orderBy: [{ priceCents: "asc" }, { version: "desc" }],
        });
    }

    /**
     * Resolve the LATEST active `Plan` version for a catalog key (e.g. "pro").
     * 404s when no active plan exists for the key — a subscribe request can only
     * target an offerable plan.
     */
    async resolveActiveByKey(key: string): Promise<Plan> {
        const plan = await prisma.plan.findFirst({
            where: { AND: [{ key }, NOT_CATALOGUE_PLAN], active: true },
            orderBy: { version: "desc" },
        });
        if (!plan) {
            throw new NotFoundException(`No active plan for key "${key}"`);
        }
        return plan;
    }

    /**
     * A catalogue plan's billable row on the LIVE version, for a cycle
     * (checkout, U15): the one place the `NOT_CATALOGUE_PLAN` filter is
     * lifted. 404 when no version is live or the version has no such plan;
     * a retired plan (`active` false) comes back for the caller to refuse.
     */
    async resolveCatalogue(
        planId: string,
        cycle: BillingCycle,
        now: Date = new Date(),
    ): Promise<Plan & { liveVersion: number }> {
        const live = await liveCatalogueVersion(prisma, now);
        const row = live
            ? await prisma.plan.findUnique({
                  where: {
                      key_version_interval: {
                          key: catalogPlanKey(planId),
                          version: live.version,
                          interval: cycle,
                      },
                  },
              })
            : null;
        if (!live || !row) {
            throw new NotFoundException(`There's no plan "${planId}" to buy.`);
        }
        return { ...row, liveVersion: live.version };
    }
}

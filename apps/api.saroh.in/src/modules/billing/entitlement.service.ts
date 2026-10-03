import { ForbiddenException, Injectable, Optional } from "@nestjs/common";
import { prisma } from "@saroh/database";
import type { RegistryModuleKey } from "@saroh/pricing-catalog";

import type { EntitlementMap, OverrideRow } from "./catalogue-access";
import { liveRaises } from "./catalogue-access";
import type { LivePlanOverride } from "./catalogue-access.service";
import {
    CatalogueAccessService,
    newestPlanOverride,
} from "./catalogue-access.service";

export { applyOverrides } from "./catalogue-access";
export type {
    EntitlementMap,
    EntitlementOverrideRow,
} from "./catalogue-access";
export { FREE_ENTITLEMENTS } from "./catalogue-access.service";
export type { LivePlanOverride } from "./catalogue-access.service";

/**
 * Server-side entitlement enforcement (S7-005), read from the pricing
 * catalogue (plans catalogue U12).
 *
 * The authoritative, server-side answer to "is this Organization allowed one
 * more X?" / "may this org use feature Y?". Other modules call this BEFORE
 * creating a site/member/etc.; the limit is NEVER trusted from the client.
 *
 * Every answer comes from {@link CatalogueAccessService.resolve}: the
 * business's plan@version (its subscription, a due pending move, or Free),
 * its live overrides (a `plan` override first — how grandfathering works,
 * U5 — then remove, grant, limit, raise) and its add-ons, turned into one
 * key → value map (`entitlementMapFor`): every catalogue row by id, each
 * row's legacy key, and the keys no row sells (`sites`, `storefronts`,
 * `customDomain`). A business the catalogue doesn't reach yet (no
 * subscription row, no plan override) reads `FREE_ENTITLEMENTS`.
 *
 * `check` enforces a numeric cap (throws `ForbiddenException` at or over the
 * limit); `can` reflects a boolean (or a row being on). Reads ONLY billing
 * models (`Subscription`, `Plan`, `EntitlementOverride`, the catalogue) —
 * never a merchant payment record.
 *
 * U11 (staff overrides) writes the override rows this reads; U13 (metering)
 * reads `CatalogueAccessService` for per-row limits and windows.
 */
@Injectable()
export class EntitlementService {
    constructor(
        // Optional so callers that build it bare (`new EntitlementService()`)
        // still read the catalogue.
        @Optional()
        private readonly access: CatalogueAccessService = new CatalogueAccessService(),
    ) {}

    /** The org's effective entitlements: its plan, overrides, add-ons, raises. */
    async getEntitlements(organizationId: string): Promise<EntitlementMap> {
        return (await this.access.resolve(organizationId)).entitlements;
    }

    /**
     * What the business's plan grants before any raise: the plan it is on
     * (after a plan override), with grants, removals, set limits and
     * add-ons. What an operator's raise must beat (`raiseLimit`).
     */
    async getPlanEntitlements(organizationId: string): Promise<EntitlementMap> {
        return (await this.access.resolve(organizationId)).planEntitlements;
    }

    /**
     * The `plan` override that applies to this business now, if any: not
     * revoked, not past its end (null lasts until removed). With several, the
     * newest wins. Expiry is read, not swept: a grandfathered business leaves
     * its plan the instant its date passes, with no job to miss.
     */
    async livePlanOverride(
        organizationId: string,
    ): Promise<LivePlanOverride | null> {
        const now = new Date();
        const rows = await prisma.entitlementOverride.findMany({
            where: {
                organizationId,
                kind: "plan",
                revokedAt: null,
                planKey: { not: null },
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            select: {
                id: true,
                kind: true,
                key: true,
                moduleKey: true,
                value: true,
                planKey: true,
                createdAt: true,
                expiresAt: true,
                revokedAt: true,
            },
        });
        return newestPlanOverride(rows as OverrideRow[], now);
    }

    /**
     * Limits an operator has raised for this Organization and that still
     * apply: not revoked, not yet expired, highest first. Expiry is read, not
     * swept — a raise stops applying the instant it lapses.
     */
    async liveOverrides(organizationId: string) {
        const rows = await prisma.entitlementOverride.findMany({
            where: {
                organizationId,
                kind: "raise",
                revokedAt: null,
                expiresAt: { gt: new Date() },
                value: { not: null },
            },
            select: {
                id: true,
                kind: true,
                key: true,
                moduleKey: true,
                value: true,
                planKey: true,
                createdAt: true,
                expiresAt: true,
                revokedAt: true,
            },
        });
        return liveRaises(rows as OverrideRow[]);
    }

    /**
     * Enforce a numeric cap. `currentCount` is how many of `key` the org has
     * NOW; returns `true` when adding one more stays within the limit and throws
     * `ForbiddenException` when the org is already AT or OVER it. A non-numeric
     * or absent entitlement is treated as no cap (always allowed).
     */
    async check(
        organizationId: string,
        key: string,
        currentCount: number,
    ): Promise<boolean> {
        const entitlements = await this.getEntitlements(organizationId);
        const limit = entitlements[key];

        if (typeof limit !== "number") {
            // No numeric cap configured for this key → unlimited.
            return true;
        }

        if (currentCount >= limit) {
            throw new ForbiddenException(
                `Plan limit reached for "${key}" (limit ${limit}); upgrade to add more.`,
            );
        }
        return true;
    }

    /**
     * A boolean feature flag (e.g. `customDomain`). Returns the entitlement's
     * boolean value, or `false` when the key is absent or non-boolean. A
     * catalogue row that is on with a cap reads through `check`, not here.
     */
    async can(organizationId: string, key: string): Promise<boolean> {
        const entitlements = await this.getEntitlements(organizationId);
        return entitlements[key] === true;
    }

    /**
     * Whether the business's plan includes a registry module (KTD-8): one of
     * the catalogue rows under it is on. True for a business off the
     * catalogue, and for a module no row sits under. Module availability asks
     * this after the rollout gate (DEC-057).
     */
    async moduleIncluded(
        organizationId: string,
        registry: RegistryModuleKey,
    ): Promise<boolean> {
        return this.access.registryModuleIncluded(organizationId, registry);
    }
}

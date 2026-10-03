import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";
import {
    CATALOG_PLAN_KEY_PREFIX,
    catalogPlanIdForKey,
    LEGACY_PLAN_KEYS,
    orderOverrides,
} from "@saroh/pricing-catalog";

/**
 * A plan's typed limit map: numeric caps (e.g. `sites: 3`) and feature flags
 * (e.g. `customDomain: true`). Stored as `Plan.entitlements` (Json) and read
 * back through this narrow shape — the ONLY thing the server enforces limits on.
 */
export type EntitlementMap = Record<string, number | boolean>;

/**
 * The FREE default entitlements — what an Organization with NO (or a cancelled)
 * subscription gets. Every org, even unsubscribed, has a floor; the paid plans
 * only ever widen it. Kept deliberately small so an unpaid tenant cannot, e.g.,
 * add a custom domain.
 */
export const FREE_ENTITLEMENTS: EntitlementMap = {
    sites: 1,
    // Places to sell from (ADR-010): a counter and an online shop, and room
    // to grow, before a plan is chosen.
    storefronts: 5,
    teamMembers: 2,
    customDomain: false,
};

/**
 * Server-side entitlement enforcement (S7-005).
 *
 * The authoritative, server-side answer to "is this Organization allowed one
 * more X?" / "may this org use feature Y?". Other modules call this BEFORE
 * creating a site/member/etc.; the limit is NEVER trusted from the client.
 *
 * `getEntitlements` resolves the org's `Subscription` → its `Plan.entitlements`
 * (or, with a live `plan` override, the plan that names — U5) and applies live
 * raises; with no active subscription and no plan override it returns
 * {@link FREE_ENTITLEMENTS}. `check`
 * enforces a numeric cap (throws `ForbiddenException` when the org is already at
 * or over the limit); `can` reflects a boolean feature flag. This class is
 * pure-ish — trivially unit-testable against a mocked Prisma.
 */
@Injectable()
export class EntitlementService {
    private readonly logger = new Logger(EntitlementService.name);

    /**
     * The org's effective entitlements: its plan's limit map (see
     * {@link getPlanEntitlements}: a live `plan` override first, then the
     * active subscription, else {@link FREE_ENTITLEMENTS}), with live raises
     * on top. Reads ONLY billing models (`Subscription`, `Plan`,
     * `EntitlementOverride`) — never a merchant payment record.
     */
    async getEntitlements(organizationId: string): Promise<EntitlementMap> {
        const [planValues, overrides] = await Promise.all([
            this.getPlanEntitlements(organizationId),
            this.liveOverrides(organizationId),
        ]);
        return applyOverrides(planValues, overrides);
    }

    /**
     * What the business's plan grants (or the free floor), before any raise.
     *
     * "Its plan" is the subscription's, unless a live `plan` override puts it
     * on another one (plans catalogue U5, KTD-6/7): that is how existing
     * businesses are grandfathered, and how a launch offer or a single
     * business's move will work. The override wins over the subscription
     * (OVERRIDE_ORDER applies `plan` first, then everything else on top),
     * so raises still apply to what it gives.
     *
     * Until U12 moves enforcement onto the catalogue, this path reads the
     * legacy `Plan.entitlements` keys (`sites`, `customDomain`, …), so an
     * override's catalogue plan is read through the legacy rows that map to
     * it — see {@link legacyPlanEntitlements}.
     */
    async getPlanEntitlements(organizationId: string): Promise<EntitlementMap> {
        const [subscription, planOverride] = await Promise.all([
            prisma.subscription.findUnique({
                where: { organizationId },
                include: { plan: true },
            }),
            this.livePlanOverride(organizationId),
        ]);
        const own =
            subscription && subscription.status !== "CANCELLED"
                ? subscription.plan
                : null;

        if (planOverride) {
            const onOverride = await this.legacyPlanEntitlements(
                planOverride.planKey,
                own,
            );
            if (onOverride) return onOverride;
            // Fail safe: an override naming a plan this path can't read
            // changes nothing, rather than reading the business as Free.
            this.logger.warn(
                `plan_override_unresolved org=${organizationId} override=${planOverride.id} plan=${planOverride.planKey}`,
            );
        }

        if (!own) return { ...FREE_ENTITLEMENTS };
        return asEntitlementMap(own.entitlements);
    }

    /**
     * The `plan` override that applies to this business now, if any: not
     * revoked, not past its end (null lasts until removed). With several, the
     * newest wins, as `orderOverrides` orders them. Expiry is read, not swept,
     * like a raise: a grandfathered business leaves Grow the instant its date
     * passes, with no job to miss.
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
                key: true,
                planKey: true,
                expiresAt: true,
                createdAt: true,
            },
        });
        const candidates = rows.map((r) => ({ ...r, kind: "plan" as const }));
        // orderOverrides keeps the objects it is given, so the row's id rides
        // along; the last one applies.
        const ordered = orderOverrides(candidates, now);
        const newest = ordered[ordered.length - 1] as
            (typeof candidates)[number] | undefined;
        if (!newest?.planKey) return null;
        return {
            id: newest.id,
            planKey: newest.planKey,
            expiresAt: newest.expiresAt,
        };
    }

    /**
     * A catalogue plan's limits on the legacy entitlement path (U5 → U12).
     *
     * - The business's own plan already maps to it (a `business`
     *   subscription grandfathered on Grow): its own row, unchanged.
     * - Free: the free floor, exactly what an unsubscribed business reads.
     * - Otherwise the newest active monthly legacy row whose key maps to it
     *   (`LEGACY_PLAN_KEYS`: `business` and `pro` → `grow`).
     *
     * Null when no legacy row maps to it (a catalogue-only plan such as
     * `pro`): the caller then ignores the override.
     */
    private async legacyPlanEntitlements(
        planKey: string,
        own: { key: string; entitlements: unknown } | null,
    ): Promise<EntitlementMap | null> {
        if (
            own &&
            !own.key.startsWith(CATALOG_PLAN_KEY_PREFIX) &&
            catalogPlanIdForKey(own.key) === planKey
        ) {
            return asEntitlementMap(own.entitlements);
        }
        if (planKey === LEGACY_PLAN_KEYS.free) return { ...FREE_ENTITLEMENTS };
        const keys = Object.entries(LEGACY_PLAN_KEYS)
            .filter(([, catalogue]) => catalogue === planKey)
            .map(([legacy]) => legacy);
        if (keys.length === 0) return null;
        const row = await prisma.plan.findFirst({
            where: { key: { in: keys }, active: true, interval: "month" },
            orderBy: [{ version: "desc" }, { createdAt: "desc" }],
            select: { entitlements: true },
        });
        return row ? asEntitlementMap(row.entitlements) : null;
    }

    /**
     * Limits an operator has raised for this Organization and that still
     * apply: not revoked, not yet expired. Expiry is read, not swept — an
     * override stops applying the instant it lapses, with no job to miss.
     */
    async liveOverrides(
        organizationId: string,
    ): Promise<EntitlementOverrideRow[]> {
        const rows = await prisma.entitlementOverride.findMany({
            where: {
                organizationId,
                // Only raises: the catalogue's other kinds (grant, remove,
                // limit, price, plan) are read through the catalogue (U12).
                kind: "raise",
                revokedAt: null,
                expiresAt: { gt: new Date() },
                value: { not: null },
            },
            select: { id: true, key: true, value: true, expiresAt: true },
            orderBy: { value: "desc" },
        });
        return rows.flatMap((r) =>
            r.value === null || r.expiresAt === null
                ? []
                : [{ ...r, value: r.value, expiresAt: r.expiresAt }],
        );
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
     * boolean value, or `false` when the key is absent or non-boolean.
     */
    async can(organizationId: string, key: string): Promise<boolean> {
        const entitlements = await this.getEntitlements(organizationId);
        return entitlements[key] === true;
    }
}

/** The live `plan` override a business is on (U5); see `livePlanOverride`. */
export interface LivePlanOverride {
    id: string;
    /** The catalogue plan id, e.g. `grow`. */
    planKey: string;
    /** Null lasts until removed. */
    expiresAt: Date | null;
}

export interface EntitlementOverrideRow {
    id: string;
    key: string;
    value: number;
    expiresAt: Date;
}

/**
 * Apply live overrides to a plan's limits. An override only ever RAISES a
 * numeric cap the plan already sets: a key the plan leaves uncapped stays
 * uncapped (an override must not impose a limit where there was none), a
 * boolean feature is untouched, and a value below the plan's own is ignored.
 */
export function applyOverrides(
    planValues: EntitlementMap,
    overrides: readonly EntitlementOverrideRow[],
): EntitlementMap {
    const out: EntitlementMap = { ...planValues };
    for (const override of overrides) {
        const current = out[override.key];
        if (typeof current === "number" && override.value > current) {
            out[override.key] = override.value;
        }
    }
    return out;
}

/**
 * Narrow a `Plan.entitlements` Json value into an {@link EntitlementMap},
 * keeping only number/boolean leaves. Anything else (nested objects, arrays,
 * strings) is ignored so a malformed row can never widen access.
 */
function asEntitlementMap(value: unknown): EntitlementMap {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return {};
    }
    const out: EntitlementMap = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
        if (typeof raw === "number" || typeof raw === "boolean") {
            out[key] = raw;
        }
    }
    return out;
}

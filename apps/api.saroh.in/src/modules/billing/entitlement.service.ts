import { ForbiddenException, Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

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
 * `getEntitlements` resolves the org's `Subscription` → its `Plan.entitlements`;
 * with no active subscription it returns {@link FREE_ENTITLEMENTS}. `check`
 * enforces a numeric cap (throws `ForbiddenException` when the org is already at
 * or over the limit); `can` reflects a boolean feature flag. This class is
 * pure-ish — trivially unit-testable against a mocked Prisma.
 */
@Injectable()
export class EntitlementService {
    /**
     * The org's effective entitlements: its active plan's limit map, or
     * {@link FREE_ENTITLEMENTS} when the org has no subscription or its
     * subscription is CANCELLED. Reads ONLY billing models (`Subscription` +
     * `Plan`) — never a merchant payment record.
     */
    async getEntitlements(organizationId: string): Promise<EntitlementMap> {
        const subscription = await prisma.subscription.findUnique({
            where: { organizationId },
            include: { plan: true },
        });

        if (!subscription || subscription.status === "CANCELLED") {
            return { ...FREE_ENTITLEMENTS };
        }

        return asEntitlementMap(subscription.plan.entitlements);
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

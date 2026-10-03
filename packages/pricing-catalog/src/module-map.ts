/**
 * How the catalogue's rows reach the product (KTD-8). The catalogue sells
 * rows such as "products" or "invoicing"; the API's module registry has
 * modules such as COMMERCE or APPOINTMENTS, and enforcement counts limit
 * keys. This table names, for each catalogue row the design ships, the
 * registry module it sits under (its rollout flag is checked first, DEC-057),
 * the limit key metering counts against, and the legacy `Plan.entitlements`
 * key an older `raise` override names.
 *
 * The rail entry a row locks (`menu`/`child`) lives in the catalogue itself,
 * because the admin edits it with the row.
 *
 * U12 wires this into module availability and U13 into metering; a row the
 * catalogue adds later that has no entry here governs nothing until it gets one.
 */

/** The API registry's module keys (`capabilities/module-registry.ts`). */
export type RegistryModuleKey =
    | "WEBSITE"
    | "CRM"
    | "APPOINTMENTS"
    | "COURSES"
    | "CLASS_PACKS"
    | "COMMERCE"
    | "PAYMENTS"
    | "COMMUNICATIONS"
    | "AUTOMATIONS"
    | "INSIGHTS";

export interface ModuleMapEntry {
    /** The registry module whose rollout gate applies first; null when none. */
    registry: RegistryModuleKey | null;
    /** The metered count a cell's limit caps; null when the row is a switch. */
    limitKey: string | null;
    /** The `Plan.entitlements` key a legacy `raise` override names, if any. */
    legacyEntitlementKey: string | null;
}

export const MODULE_MAP: Readonly<Record<string, ModuleMapEntry>> = {
    website: {
        registry: "WEBSITE",
        limitKey: null,
        legacyEntitlementKey: null,
    },
    themes: { registry: "WEBSITE", limitKey: null, legacyEntitlementKey: null },
    review: { registry: "WEBSITE", limitKey: null, legacyEntitlementKey: null },
    blog: {
        registry: "WEBSITE",
        limitKey: "blogPosts",
        legacyEntitlementKey: null,
    },
    products: {
        registry: "COMMERCE",
        limitKey: "products",
        legacyEntitlementKey: null,
    },
    orders: {
        registry: "COMMERCE",
        limitKey: "ordersPerMonth",
        legacyEntitlementKey: null,
    },
    subscriptions: {
        registry: null,
        limitKey: null,
        legacyEntitlementKey: null,
    },
    bookings: {
        registry: "APPOINTMENTS",
        limitKey: "bookingsPerMonth",
        legacyEntitlementKey: null,
    },
    invoicing: { registry: null, limitKey: null, legacyEntitlementKey: null },
    members: {
        registry: null,
        limitKey: "teamMembers",
        legacyEntitlementKey: "teamMembers",
    },
    roles: { registry: null, limitKey: null, legacyEntitlementKey: null },
    integrations: {
        registry: null,
        limitKey: "integrations",
        legacyEntitlementKey: null,
    },
};

/** The catalogue row a legacy entitlement key belongs to, if any. */
export function moduleForLegacyKey(key: string): string | null {
    for (const [moduleId, e] of Object.entries(MODULE_MAP)) {
        if (e.legacyEntitlementKey === key) return moduleId;
    }
    return null;
}

/**
 * Billing's legacy `Plan.key`s and the catalogue plan each one resolves as
 * (OQ-3): a paying business never resolves as Free.
 */
export const LEGACY_PLAN_KEYS: Readonly<Record<string, string>> = {
    free: "free",
    pro: "grow",
    business: "grow",
};

/** The prefix that keeps catalogue `Plan` rows clear of legacy ones (KTD-2). */
export const CATALOG_PLAN_KEY_PREFIX = "catalog.";

/** `Plan.key` for a catalogue plan id. */
export function catalogPlanKey(planId: string): string {
    return `${CATALOG_PLAN_KEY_PREFIX}${planId}`;
}

/**
 * The catalogue plan id a `Plan.key` stands for: the id itself for a
 * catalogue row, the mapped plan for a legacy key, else null.
 */
export function catalogPlanIdForKey(key: string): string | null {
    if (key.startsWith(CATALOG_PLAN_KEY_PREFIX)) {
        return key.slice(CATALOG_PLAN_KEY_PREFIX.length) || null;
    }
    return LEGACY_PLAN_KEYS[key] ?? null;
}

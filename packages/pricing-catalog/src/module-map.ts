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
    /** How many websites; `sites` was an unsold entitlement before (DEC-018). */
    sites: {
        registry: "WEBSITE",
        limitKey: "sites",
        legacyEntitlementKey: null,
    },
    /** Places customers visit (a `SHOP` location); an online-only one never counts. */
    locations: {
        registry: null,
        limitKey: "shopLocations",
        legacyEntitlementKey: null,
    },
    themes: { registry: "WEBSITE", limitKey: null, legacyEntitlementKey: null },
    review: { registry: "WEBSITE", limitKey: null, legacyEntitlementKey: null },
    blog: {
        registry: "WEBSITE",
        limitKey: "blogPosts",
        legacyEntitlementKey: null,
    },
    /** Site visits in a month: soft, so a busy site is never turned away. */
    visits: {
        registry: "WEBSITE",
        limitKey: "visitsPerMonth",
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
    /** Invite-only product reviews, under Commerce on every plan. */
    reviews: {
        registry: "COMMERCE",
        limitKey: null,
        legacyEntitlementKey: null,
    },
    /**
     * Taking money online through the business's own Razorpay or Cashfree.
     * Off, new online payments stop; renewals a business already has go on.
     */
    payments: {
        registry: "PAYMENTS",
        limitKey: null,
        legacyEntitlementKey: null,
    },
    /** Memberships that renew; they take money, so they sit under Payments. */
    subscriptions: {
        registry: "PAYMENTS",
        limitKey: null,
        legacyEntitlementKey: null,
    },
    bookings: {
        registry: "APPOINTMENTS",
        limitKey: "bookingsPerMonth",
        legacyEntitlementKey: null,
    },
    /** Invoicing needs no module (DEC-070); a row so the cards can say so. */
    invoicing: { registry: null, limitKey: null, legacyEntitlementKey: null },
    /** Media storage in GB: soft. */
    storage: {
        registry: null,
        limitKey: "storageGb",
        legacyEntitlementKey: null,
    },
    members: {
        registry: null,
        limitKey: "teamMembers",
        legacyEntitlementKey: "teamMembers",
    },
    /**
     * Reviewers only read, comment on and approve the sites they're invited to
     * (DEC-006): they use no team seat, but a plan caps how many.
     */
    reviewers: {
        registry: null,
        limitKey: "reviewers",
        legacyEntitlementKey: null,
    },
    roles: { registry: null, limitKey: null, legacyEntitlementKey: null },
    integrations: {
        registry: null,
        limitKey: "integrations",
        legacyEntitlementKey: null,
    },
    /**
     * Booking emails Saroh sends for a business with no email provider of
     * its own (DEC-086), a month. Under no registry module: the allowance
     * never gates Communications or the business's own provider.
     */
    "saroh-emails": {
        registry: null,
        limitKey: "sarohEmailsPerMonth",
        legacyEntitlementKey: null,
    },
};

/**
 * The catalogue rows that sit under one registry module, in `MODULE_MAP`'s
 * order. Module availability (U12) reads a registry module as included when
 * any of these is on for the business; with none, the catalogue doesn't
 * govern it.
 */
export function catalogueModulesFor(registry: RegistryModuleKey): string[] {
    return Object.entries(MODULE_MAP)
        .filter(([, e]) => e.registry === registry)
        .map(([moduleId]) => moduleId);
}

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

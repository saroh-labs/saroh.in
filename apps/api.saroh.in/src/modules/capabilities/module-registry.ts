/**
 * Typed Organization module (capability) registry — ADR-003, plan Task 1.
 *
 * Saroh has an always-available business core (Organization, Projects, members,
 * customers, activity, settings, audit, subscription, module management) and a
 * set of *optional modules* that an Organization enables by business need. This
 * file is the single server-owned source of truth for the module set: its keys,
 * dependencies, root routes, and the four independent gates a capability passes
 * through. Frontends receive a serialized projection of this registry and MUST
 * NOT maintain their own dependency or permission maps.
 *
 * The four gates are deliberately separate decisions (see ADR-003):
 *   1. Rollout flag        — Saroh's kill switch          (`rolloutFlag`)
 *   2. Module installation — the Organization's choice    (persisted, Task 2)
 *   3. Entitlement         — commercial rights/limits      (`entitlementKey`)
 *   4. Authorization       — what the actor may do         (`requiredAction`)
 *
 * Readiness (`SETUP_REQUIRED` / `ACTIVE` / `ATTENTION_REQUIRED`) is *derived*,
 * never persisted — it is computed by a per-module readiness adapter (Task 4).
 *
 * AI is intentionally NOT a module here (DEC-015).
 */
import type { EntitlementMap } from "../billing/entitlement.service";
import { FREE_ENTITLEMENTS } from "../billing/entitlement.service";
import type { FlagKey as FlagKeyType } from "../feature-flags/flags";
import { FlagKey, isKnownFlagKey } from "../feature-flags/flags";
import type { OrgAction } from "../organizations/organization-policy";
import { ORG_ACTIONS } from "../organizations/organization-policy";

/** The initial optional-module set. AI is excluded under DEC-015. */
export const MODULE_KEYS = [
    "WEBSITE",
    "CRM",
    "APPOINTMENTS",
    "COMMERCE",
    "PAYMENTS",
    "COMMUNICATIONS",
    "AUTOMATIONS",
    "INSIGHTS",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

/** Persisted lifecycle values (Task 2 stores these; readiness is NOT one). */
export type ModuleLifecycle = "DISABLED" | "ENABLED" | "ARCHIVED";

/** Derived operational readiness — computed, never persisted. */
export type ModuleReadiness =
    | "DISABLED"
    | "SETUP_REQUIRED"
    | "ACTIVE"
    | "ATTENTION_REQUIRED";

/**
 * One module's server-owned descriptor.
 *
 * `readinessAdapter` and `deactivationPolicy` are identifiers (keyed by module)
 * that Task 4 resolves to the concrete adapter/policy implementation; in this
 * first registry version each equals the module's own key.
 */
export interface ModuleDescriptor {
    key: ModuleKey;
    label: string;
    description: string;
    /** Product-shell routes owned by the module. Every route must start with `/`. */
    rootRoutes: readonly string[];
    /** The representative OrgAction gating the module's primary capability. */
    requiredAction: OrgAction;
    /** Hard *enable-time* dependencies — a module cannot be enabled without these. */
    dependencies: readonly ModuleKey[];
    /** Whether a Project may select this module from its Organization's enabled set. */
    projectSelectable: boolean;
    /** Saroh-side rollout kill switch (separate from installation/entitlement/authz). */
    rolloutFlag: FlagKeyType;
    /** Optional commercial-entitlement key gating the module. */
    entitlementKey?: keyof EntitlementMap;
    /** Identifier for the module's readiness adapter (Task 4). */
    readinessAdapter: ModuleKey;
    /** Identifier for the module's safe-deactivation policy (Task 4). */
    deactivationPolicy: ModuleKey;
}

/**
 * The first registry version.
 *
 * Hard enable-dependencies are intentionally conservative; broader OR-style
 * relationships (e.g. Payments needs Appointments OR Commerce, Insights needs
 * any event-producing module) are *readiness* concerns resolved by the adapters
 * in Task 4, not enable-time dependencies encoded here.
 */
export const MODULES: readonly ModuleDescriptor[] = [
    {
        key: "WEBSITE",
        label: "Website",
        description:
            "Sites, pages, templates, forms, and domains — the Organization's public presence.",
        rootRoutes: ["/website"],
        requiredAction: "site:update",
        dependencies: [],
        projectSelectable: true,
        rolloutFlag: FlagKey.MODULE_WEBSITE,
        readinessAdapter: "WEBSITE",
        deactivationPolicy: "WEBSITE",
    },
    {
        key: "CRM",
        label: "CRM",
        description:
            "Contacts, leads, pipelines, and activity — the customer relationship core.",
        rootRoutes: ["/crm"],
        requiredAction: "lead:read",
        dependencies: [],
        projectSelectable: true,
        rolloutFlag: FlagKey.MODULE_CRM,
        readinessAdapter: "CRM",
        deactivationPolicy: "CRM",
    },
    {
        key: "APPOINTMENTS",
        label: "Appointments",
        description: "Services, availability, and bookings for scheduled work.",
        rootRoutes: ["/appointments"],
        requiredAction: "booking:read",
        dependencies: ["CRM"],
        projectSelectable: true,
        rolloutFlag: FlagKey.MODULE_APPOINTMENTS,
        readinessAdapter: "APPOINTMENTS",
        deactivationPolicy: "APPOINTMENTS",
    },
    {
        key: "COMMERCE",
        label: "Commerce",
        description:
            "Catalog, inventory, carts, and orders for selling products.",
        rootRoutes: ["/commerce"],
        requiredAction: "order:read",
        dependencies: [],
        projectSelectable: true,
        rolloutFlag: FlagKey.MODULE_COMMERCE,
        readinessAdapter: "COMMERCE",
        deactivationPolicy: "COMMERCE",
    },
    {
        key: "PAYMENTS",
        label: "Payments",
        description:
            "Payment providers, checkout intents, and reconciliation. Becomes ready once Appointments or Commerce is enabled and a provider is healthy.",
        rootRoutes: ["/payments"],
        requiredAction: "payment:read",
        dependencies: [],
        projectSelectable: true,
        rolloutFlag: FlagKey.MODULE_PAYMENTS,
        readinessAdapter: "PAYMENTS",
        deactivationPolicy: "PAYMENTS",
    },
    {
        key: "COMMUNICATIONS",
        label: "Communications",
        description:
            "Messages, delivery, and consent over the Organization's connected providers.",
        rootRoutes: ["/communications"],
        requiredAction: "message:read",
        dependencies: ["CRM"],
        projectSelectable: true,
        rolloutFlag: FlagKey.MODULE_COMMUNICATIONS,
        readinessAdapter: "COMMUNICATIONS",
        deactivationPolicy: "COMMUNICATIONS",
    },
    {
        key: "AUTOMATIONS",
        label: "Automations",
        description:
            "Constrained trigger/action rules that reduce repetitive follow-up.",
        rootRoutes: ["/automations"],
        requiredAction: "automation:manage",
        dependencies: ["CRM"],
        projectSelectable: true,
        rolloutFlag: FlagKey.MODULE_AUTOMATIONS,
        readinessAdapter: "AUTOMATIONS",
        deactivationPolicy: "AUTOMATIONS",
    },
    {
        key: "INSIGHTS",
        label: "Insights",
        description:
            "Cross-module analytics and dashboards. Becomes ready once at least one event-producing module is active.",
        rootRoutes: ["/insights"],
        requiredAction: "analytics:read",
        dependencies: [],
        projectSelectable: true,
        rolloutFlag: FlagKey.MODULE_INSIGHTS,
        readinessAdapter: "INSIGHTS",
        deactivationPolicy: "INSIGHTS",
    },
];

const MODULE_KEY_SET: ReadonlySet<string> = new Set(MODULE_KEYS);
const ORG_ACTION_SET: ReadonlySet<string> = new Set(ORG_ACTIONS);
const ENTITLEMENT_KEY_SET: ReadonlySet<string> = new Set(
    Object.keys(FREE_ENTITLEMENTS),
);

/** Result of a successful {@link validateModuleRegistry} run. */
export interface ModuleRegistryValid {
    valid: true;
}

/**
 * Validate a module registry, throwing a descriptive `Error` on the first
 * violation and returning `{ valid: true }` when the registry is sound.
 *
 * Rejects: unknown/`AI` keys, duplicate keys or labels, dependencies outside
 * `MODULE_KEYS`, direct or transitive dependency cycles, routes not beginning
 * with `/`, a Project-selectable module whose dependency is not selectable, and
 * rollout or entitlement keys absent from their typed registries.
 */
export function validateModuleRegistry(
    modules: readonly ModuleDescriptor[],
): ModuleRegistryValid {
    const seenKeys = new Set<string>();
    const seenLabels = new Set<string>();

    for (const m of modules) {
        // Unknown key / explicit AI exclusion (DEC-015).
        if ((m.key as string) === "AI") {
            throw new Error("AI is not a module (excluded by DEC-015)");
        }
        if (!MODULE_KEY_SET.has(m.key)) {
            throw new Error(`unknown module key: ${m.key}`);
        }
        // Duplicate keys / labels.
        if (seenKeys.has(m.key)) {
            throw new Error(`duplicate module key: ${m.key}`);
        }
        seenKeys.add(m.key);
        if (seenLabels.has(m.label)) {
            throw new Error(`duplicate module label: ${m.label}`);
        }
        seenLabels.add(m.label);

        // Dependencies must reference known modules.
        for (const dep of m.dependencies) {
            if (!MODULE_KEY_SET.has(dep)) {
                throw new Error(
                    `module ${m.key} depends on unknown module: ${dep}`,
                );
            }
        }

        // Routes must be absolute product-shell paths.
        for (const route of m.rootRoutes) {
            if (!route.startsWith("/")) {
                throw new Error(
                    `module ${m.key} has a root route not beginning with "/": ${route}`,
                );
            }
        }

        // Rollout flag must be a registered flag key.
        if (!isKnownFlagKey(m.rolloutFlag)) {
            throw new Error(
                `module ${m.key} references an unknown rollout flag: ${String(m.rolloutFlag)}`,
            );
        }

        // Required action must be a registered OrgAction.
        if (!ORG_ACTION_SET.has(m.requiredAction)) {
            throw new Error(
                `module ${m.key} references an unknown OrgAction: ${m.requiredAction}`,
            );
        }

        // Optional entitlement key, when set, must be a registered entitlement.
        if (
            m.entitlementKey !== undefined &&
            !ENTITLEMENT_KEY_SET.has(String(m.entitlementKey))
        ) {
            throw new Error(
                `module ${m.key} references an unknown entitlement key: ${String(m.entitlementKey)}`,
            );
        }

        // Readiness/deactivation identifiers must reference known modules.
        if (!MODULE_KEY_SET.has(m.readinessAdapter)) {
            throw new Error(
                `module ${m.key} references an unknown readiness adapter: ${m.readinessAdapter}`,
            );
        }
        if (!MODULE_KEY_SET.has(m.deactivationPolicy)) {
            throw new Error(
                `module ${m.key} references an unknown deactivation policy: ${m.deactivationPolicy}`,
            );
        }
    }

    // Direct or transitive dependency cycles.
    assertAcyclic(modules);

    // A Project-selectable module's dependencies must also be selectable,
    // otherwise a Project could never satisfy them.
    const byKey = new Map(modules.map((m) => [m.key, m]));
    for (const m of modules) {
        if (!m.projectSelectable) continue;
        for (const dep of m.dependencies) {
            const depModule = byKey.get(dep);
            if (depModule && !depModule.projectSelectable) {
                throw new Error(
                    `project-selectable module ${m.key} depends on non-selectable module ${dep}`,
                );
            }
        }
    }

    return { valid: true };
}

/** Depth-first cycle detection over the dependency graph. */
function assertAcyclic(modules: readonly ModuleDescriptor[]): void {
    const deps = new Map<string, readonly ModuleKey[]>(
        modules.map((m) => [m.key, m.dependencies]),
    );
    const VISITING = 1;
    const DONE = 2;
    const state = new Map<string, number>();

    const visit = (key: string, path: readonly string[]): void => {
        const current = state.get(key);
        if (current === DONE) return;
        if (current === VISITING) {
            throw new Error(
                `module dependency cycle detected: ${[...path, key].join(" -> ")}`,
            );
        }
        state.set(key, VISITING);
        for (const dep of deps.get(key) ?? []) {
            visit(dep, [...path, key]);
        }
        state.set(key, DONE);
    };

    for (const m of modules) {
        visit(m.key, []);
    }
}

/** All descriptors keyed by module key, for O(1) lookup by consumers. */
export const MODULE_BY_KEY: ReadonlyMap<ModuleKey, ModuleDescriptor> = new Map(
    MODULES.map((m) => [m.key, m]),
);

// Fail fast at import time if the shipped registry is ever made invalid.
validateModuleRegistry(MODULES);

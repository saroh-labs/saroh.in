/**
 * Typed registry of known feature-flag keys.
 *
 * Callers reference flags through `FlagKey.ORG_AUTHORIZATION` rather than raw
 * strings, so a typo is a compile error and the set of live flags is
 * discoverable in one place. The string values are the persisted `key` on the
 * FeatureFlag / FeatureFlagOverride rows.
 */
export const FlagKey = {
    /** Stage 1 org-authorization switch (ADR-001). */
    ORG_AUTHORIZATION: "ORG_AUTHORIZATION",

    /**
     * Per-module Saroh-side rollout switches (ADR-003). These are the *rollout*
     * gate only — the emergency/gradual kill switch Saroh controls — and are
     * deliberately distinct from an Organization *enabling* a module (an
     * installation record) and from *entitlement* (commercial rights). A module
     * is available only when its rollout flag is on AND the Organization has
     * enabled it AND entitlement AND authorization all pass. Default false, so
     * modules dark-roll out (see the modular-capabilities plan, Task 9).
     */
    MODULE_WEBSITE: "MODULE_WEBSITE",
    MODULE_CRM: "MODULE_CRM",
    MODULE_APPOINTMENTS: "MODULE_APPOINTMENTS",
    MODULE_COURSES: "MODULE_COURSES",
    MODULE_COMMERCE: "MODULE_COMMERCE",
    MODULE_PAYMENTS: "MODULE_PAYMENTS",
    MODULE_COMMUNICATIONS: "MODULE_COMMUNICATIONS",
    MODULE_AUTOMATIONS: "MODULE_AUTOMATIONS",
    MODULE_INSIGHTS: "MODULE_INSIGHTS",
} as const;

export type FlagKey = (typeof FlagKey)[keyof typeof FlagKey];

/** All registered flag keys, for iteration / validation. */
export const FLAG_KEYS: FlagKey[] = Object.values(FlagKey);

const KEY_SET: ReadonlySet<string> = new Set(FLAG_KEYS);

/** True when `key` is a known, registered flag key. */
export function isKnownFlagKey(key: string): key is FlagKey {
    return KEY_SET.has(key);
}

/**
 * What each flag is for, who owns it, and when it should go (admin console
 * U10, R16). A flag is a debt: it forks behaviour until someone removes it.
 * Every registered key must say why it exists and by when it will be
 * reviewed for deletion — `flags.spec.ts` fails a key that does not, so a
 * flag cannot be added without a plan to take it away.
 */
export interface FlagMetadata {
    /** What turning it on does, in a sentence an operator can act on. */
    purpose: string;
    /** Who decides when it changes — a role, not a person. */
    owner: string;
    /** ISO date by which it is reviewed for deletion. */
    reviewBy: string;
    /** What has to be true before it can be deleted. */
    removeWhen: string;
}

const MODULE_ROLLOUT = (label: string): FlagMetadata => ({
    purpose: `Makes the ${label} module available to a business that has switched it on. Off hides it everywhere, whatever the business chose.`,
    owner: "Release manager",
    reviewBy: "2027-03-31",
    removeWhen: `${label} is on for every business on every instance and has needed no kill switch for a release.`,
});

export const FLAG_METADATA: Record<FlagKey, FlagMetadata> = {
    ORG_AUTHORIZATION: {
        purpose:
            "Authorizes a store's staff through the business's own roles (ADR-001). Off keeps the older per-store owner and staff checks.",
        owner: "Platform owner",
        reviewBy: "2026-12-31",
        removeWhen:
            "Every instance runs with it on and the fallback path has been deleted from the code.",
    },
    MODULE_WEBSITE: MODULE_ROLLOUT("Website"),
    MODULE_CRM: MODULE_ROLLOUT("CRM"),
    MODULE_APPOINTMENTS: MODULE_ROLLOUT("Appointments"),
    MODULE_COURSES: MODULE_ROLLOUT("Courses"),
    MODULE_COMMERCE: MODULE_ROLLOUT("Commerce"),
    MODULE_PAYMENTS: MODULE_ROLLOUT("Payments"),
    MODULE_COMMUNICATIONS: MODULE_ROLLOUT("Communications"),
    MODULE_AUTOMATIONS: MODULE_ROLLOUT("Automations"),
    MODULE_INSIGHTS: MODULE_ROLLOUT("Insights"),
};

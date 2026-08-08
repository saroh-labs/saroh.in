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

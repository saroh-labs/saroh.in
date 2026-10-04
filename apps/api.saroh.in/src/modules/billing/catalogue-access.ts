/**
 * How a business's catalogue access becomes the limit map the API enforces
 * (plans catalogue U12, KTD-8). Pure: `CatalogueAccessService` reads the rows
 * and calls these; the specs call them without a database.
 *
 * `resolveAllAccess` (`@saroh/pricing-catalog`) answers per catalogue row:
 * plan@version, then the business's overrides (plan, remove, grant, limit,
 * raise), then its add-ons. The API's enforcement points still ask
 * `EntitlementService` for keys (`check(org, "storefronts", n)`,
 * `can(org, "customDomain")`), so {@link entitlementMapFor} turns the rows
 * back into one map:
 *
 * - every catalogue row by its id: its cap, `true` when on with no cap, or
 *   `false` when off — the shape `Plan.entitlements` holds for a catalogue
 *   plan (`entitlementsFor`);
 * - a row's legacy key (`MODULE_MAP[row].legacyEntitlementKey`, e.g.
 *   `teamMembers`) beside it, with the same cap (absent when uncapped, 0 when
 *   off);
 * - the keys no catalogue row sells: from the business's own legacy row when
 *   it is still on one, else {@link UNSOLD_ENTITLEMENTS} and the paid-plan
 *   switches ({@link PAID_PLAN_SWITCHES}).
 */
import type {
    Catalog,
    ModuleAccess,
    ModuleMapEntry,
    Override,
    OverrideKind,
    RegistryModuleKey,
} from "@saroh/pricing-catalog";
import { MODULE_MAP, OVERRIDE_KINDS } from "@saroh/pricing-catalog";

/** A row's `MODULE_MAP` entry; a row the map doesn't know governs nothing. */
export function mapEntry(moduleId: string): ModuleMapEntry | undefined {
    return Object.prototype.hasOwnProperty.call(MODULE_MAP, moduleId)
        ? MODULE_MAP[moduleId]
        : undefined;
}

/**
 * A plan's typed limit map: numeric caps (e.g. `sites: 3`) and feature flags
 * (e.g. `customDomain: true`). The ONLY thing the server enforces limits on.
 */
export type EntitlementMap = Record<string, number | boolean>;

/**
 * Keys enforced today that no catalogue row sells, the same on every
 * catalogue plan. They are product defaults, not plan terms: one website
 * (DEC-018, beside the product's own cap) and the default number of
 * locations (DEC-030). A raise still lifts them for one business.
 */
export const UNSOLD_ENTITLEMENTS: Readonly<EntitlementMap> = {
    sites: 1,
    storefronts: 5,
};

/**
 * Switches no catalogue row carries, on with any plan that has a price and
 * off on a free one. A custom domain is what the paid plans' website rows
 * promise ("on your own domain"); the catalogue has the words, not a field.
 */
export const PAID_PLAN_SWITCHES: readonly string[] = ["customDomain"];

/** An `EntitlementOverride` row, as `CatalogueAccessService` reads it. */
export interface OverrideRow {
    id: string;
    kind: string;
    key: string;
    moduleKey: string | null;
    value: number | null;
    planKey: string | null;
    createdAt: Date;
    expiresAt: Date | null;
    revokedAt: Date | null;
}

const KINDS: ReadonlySet<string> = new Set(OVERRIDE_KINDS);

/** Rows as `@saroh/pricing-catalog` overrides; an unknown kind is dropped. */
export function toOverrides(rows: readonly OverrideRow[]): Override[] {
    return rows.flatMap((r) =>
        KINDS.has(r.kind)
            ? [
                  {
                      kind: r.kind as OverrideKind,
                      key: r.key,
                      moduleKey: r.moduleKey,
                      value: r.value,
                      planKey: r.planKey,
                      createdAt: r.createdAt,
                      expiresAt: r.expiresAt,
                      revokedAt: r.revokedAt,
                  },
              ]
            : [],
    );
}

/** A raise is the only kind that leaves a business's plan values alone. */
export function withoutRaises(overrides: readonly Override[]): Override[] {
    return overrides.filter((o) => o.kind !== "raise");
}

/**
 * The limit map for one business's resolved rows (see the file comment).
 * `legacyRow` is its own legacy `Plan.entitlements` when it is still on that
 * plan (a `business` or `pro` subscriber no override has moved), else null.
 */
export function entitlementMapFor(input: {
    catalog: Catalog;
    access: readonly ModuleAccess[];
    /** The plan it is on after a plan override. */
    planId: string;
    legacyRow: EntitlementMap | null;
}): EntitlementMap {
    const plan = input.catalog.plans.find((p) => p.id === input.planId);
    const paid = (plan?.pricePaise ?? 0) > 0;
    const out: EntitlementMap = input.legacyRow
        ? { ...input.legacyRow }
        : {
              ...UNSOLD_ENTITLEMENTS,
              ...Object.fromEntries(PAID_PLAN_SWITCHES.map((k) => [k, paid])),
          };
    for (const a of input.access) {
        const on = a.state === "on";
        out[a.moduleId] = on ? (a.limit ?? true) : false;
        const legacyKey = mapEntry(a.moduleId)?.legacyEntitlementKey;
        if (!legacyKey) continue;
        if (!on) out[legacyKey] = 0;
        else if (a.limit === null) delete out[legacyKey];
        else out[legacyKey] = a.limit;
    }
    return out;
}

/**
 * Whether the business's plan includes a registry module: one of the
 * catalogue rows under it (`MODULE_MAP`) is on. A registry module with no row
 * in this version isn't the catalogue's to lock. The rollout gate (DEC-057)
 * is the caller's, and comes first.
 */
export function registryModuleIncluded(
    catalog: Catalog,
    access: readonly ModuleAccess[],
    registry: RegistryModuleKey,
): boolean {
    const rows = catalog.modules
        .map((m) => m.id)
        .filter((id) => mapEntry(id)?.registry === registry);
    if (rows.length === 0) return true;
    return access.some((a) => rows.includes(a.moduleId) && a.state === "on");
}

/** A live `raise` override, as `EntitlementService.liveOverrides` lists it. */
export interface EntitlementOverrideRow {
    id: string;
    key: string;
    value: number;
    expiresAt: Date;
}

/**
 * Apply live raises to a limit map. A raise only ever RAISES a numeric cap
 * the map already sets: a key left uncapped stays uncapped (a raise must not
 * impose a limit where there was none), a boolean feature is untouched, and
 * a value below the current one is ignored. On the catalogue path the rows'
 * raises are already in (`resolveAccess`); this lifts the keys no row sells
 * (`sites`, `storefronts`), and is a no-op on the rest.
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

/** The live raises among a business's override rows. */
export function liveRaises(
    rows: readonly OverrideRow[],
): EntitlementOverrideRow[] {
    return rows
        .flatMap((r) =>
            r.kind === "raise" && r.value !== null && r.expiresAt !== null
                ? [
                      {
                          id: r.id,
                          key: r.key,
                          value: r.value,
                          expiresAt: r.expiresAt,
                      },
                  ]
                : [],
        )
        .sort((a, b) => b.value - a.value);
}

/**
 * Narrow a `Plan.entitlements` Json value into an {@link EntitlementMap},
 * keeping only number/boolean leaves. Anything else (nested objects, arrays,
 * strings) is ignored so a malformed row can never widen access.
 */
export function asEntitlementMap(value: unknown): EntitlementMap {
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

/** One catalogue row as `GET …/billing/access` returns it. */
export interface ModuleAccessView {
    moduleId: string;
    name: string;
    what: string;
    /** on, or how it shows when off: locked (upgrade panel) or hidden. */
    state: ModuleAccess["state"];
    /** The cap, null for none. */
    limit: number | null;
    per: ModuleAccess["per"];
    text: string;
    /** Why it differs from the plan, in the design's words; empty if not. */
    override: string;
    /**
     * Metered use against `limit` (U13, `metering.ts`): this month's count
     * for a monthly row. Null for a row metering doesn't count (a switch) or
     * that is off.
     */
    usage: number | null;
    /** The rail entry it locks, if any. */
    menu: string | null;
    child: string | null;
    /** The first offered plan above its own that includes the row. */
    upgradeTo: { planId: string; name: string; pricePaise: number } | null;
}

/** `GET organizations/:org/billing/access` (U12, for U14's screens). */
export interface BillingAccessView {
    /** `legacy`: the catalogue doesn't reach this business yet; no rows. */
    source: "catalogue" | "legacy";
    /**
     * Whether its limits and locks are enforced (`PLAN_ENFORCEMENT`, OQ-4).
     * Off, nothing is refused, so the merchant app shows no lock or "you'll
     * be stopped" notice (U14); usage still reads.
     */
    enforced: boolean;
    version: number | null;
    plan: { id: string; name: string } | null;
    /** What it pays a month before GST (paise): a custom price, else its plan's. */
    pricePaise: number | null;
    /** A plan override it is on (a grandfathered business: until when). */
    planOverride: { planKey: string; expiresAt: string | null } | null;
    pendingMove: {
        planId: string;
        version: number;
        from: string;
        /**
         * Its date has passed but it can't apply yet (U15): `held` while its
         * version's plans aren't at the billing provider, `authorise` while
         * the business must authorise the new amount (OQ-6). Null otherwise.
         */
        waiting: "held" | "authorise" | null;
    } | null;
    modules: ModuleAccessView[];
}

/**
 * The catalogue rows of a resolved business, for the merchant app. `usage`
 * is metering's count by row id (`usageByModule`); a row it leaves out reads
 * null.
 */
export function moduleAccessViews(
    catalog: Catalog,
    access: readonly ModuleAccess[],
    usage: Readonly<Record<string, number>> = {},
): ModuleAccessView[] {
    return access.map((a) => {
        const m = catalog.modules.find((x) => x.id === a.moduleId);
        return {
            moduleId: a.moduleId,
            name: a.name,
            what: a.what,
            state: a.state,
            limit: a.state === "on" ? a.limit : null,
            per: a.per,
            text: a.text,
            override: a.override,
            usage:
                a.state === "on" &&
                Object.prototype.hasOwnProperty.call(usage, a.moduleId)
                    ? usage[a.moduleId]
                    : null,
            menu: m?.menu ?? null,
            child: m?.child ?? null,
            upgradeTo: a.upgradePlanId
                ? {
                      planId: a.upgradePlanId,
                      name: a.upgradeTo,
                      pricePaise: a.upgradePricePaise,
                  }
                : null,
        };
    });
}

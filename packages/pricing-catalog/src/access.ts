import { offeredPlans } from "./card-lines";
import { moduleForLegacyKey } from "./module-map";
import type { Override } from "./overrides";
import {
    effectivePlanId,
    orderOverrides,
    priceOverridePaise,
} from "./overrides";
import type { Catalog, LimitPeriod, OffState } from "./schema";
import { cellOf } from "./schema";

/** Add-ons a business has bought: an add-on id from its version, and how many. */
export interface BoughtAddon {
    addonId: string;
    quantity: number;
}

export interface AccessInput {
    /** The catalogue version the business is on (not necessarily the live one). */
    catalog: Catalog;
    /** Its plan on that version. */
    planId: string;
    overrides?: readonly Override[];
    addons?: readonly BoughtAddon[];
    now: Date;
}

export type AccessState = "on" | OffState;

export interface ModuleAccess {
    moduleId: string;
    state: AccessState;
    inc: boolean;
    /** Where it's off: shown locked, or hidden. */
    off: OffState;
    text: string;
    /** The cap, or null for none. */
    limit: number | null;
    per: LimitPeriod;
    name: string;
    what: string;
    /** Why it differs from the plan, in the design's words; empty when it doesn't. */
    override: string;
    /** The first offered plan above this one that includes it, if any. */
    upgradeTo: string;
    upgradePlanId: string;
    upgradePricePaise: number;
    /** The plan's name the business is on (after a plan override). */
    plan: string;
    planId: string;
}

function moduleOf(o: Override): string | null {
    if (o.moduleKey) return o.moduleKey;
    if (o.kind === "raise") return moduleForLegacyKey(o.key) ?? o.key;
    return null;
}

/**
 * What one business gets for one catalogue module: its plan on its version,
 * then its overrides in order (plan, remove, grant, limit, raise), then the
 * add-ons it bought, read from the same version (KTD-5).
 *
 * A module the catalogue doesn't know is on: the catalogue only takes away
 * what it lists. The rollout gate (DEC-057) is the caller's, and comes first.
 */
export function resolveAccess(
    input: AccessInput,
    moduleId: string,
): ModuleAccess {
    const { catalog, now } = input;
    const overrides = input.overrides ?? [];
    const planIds = new Set(catalog.plans.map((p) => p.id));
    const planId = effectivePlanId(input.planId, overrides, now, planIds);
    const plan = catalog.plans.find((p) => p.id === planId);
    const mod = catalog.modules.find((m) => m.id === moduleId);

    const base: ModuleAccess = {
        moduleId,
        state: "on",
        inc: true,
        off: "locked",
        text: "",
        limit: null,
        per: "",
        name: mod?.name ?? moduleId,
        what: mod?.what ?? "",
        override: "",
        upgradeTo: "",
        upgradePlanId: "",
        upgradePricePaise: 0,
        plan: plan?.name ?? planId,
        planId,
    };
    if (!mod) return base;

    const cell = cellOf(mod, planId);
    const r: ModuleAccess = cell.inc
        ? {
              ...base,
              inc: true,
              text: cell.text,
              limit: cell.limit,
              per: cell.per,
          }
        : { ...base, inc: false, off: cell.off };

    for (const o of orderOverrides(overrides, now)) {
        if (moduleOf(o) !== moduleId) continue;
        switch (o.kind) {
            case "remove":
                r.inc = false;
                r.off = "hidden";
                r.override = "Removed by Saroh";
                break;
            case "grant":
                r.inc = true;
                r.text = "Granted";
                r.limit = null;
                r.override = "Granted by Saroh";
                break;
            case "limit":
                if (r.inc && typeof o.value === "number") {
                    r.limit = o.value;
                    r.text =
                        o.value.toLocaleString("en-IN") +
                        (r.per ? ` a ${r.per}` : "");
                    r.override = "Limit set by Saroh";
                }
                break;
            case "raise":
                // Raise-only, as EntitlementService.applyOverrides always was.
                if (
                    r.inc &&
                    r.limit !== null &&
                    typeof o.value === "number" &&
                    o.value > r.limit
                ) {
                    r.limit = o.value;
                    r.override = r.override || "Raised by Saroh";
                }
                break;
            default:
                break;
        }
    }

    for (const bought of input.addons ?? []) {
        const n = Math.max(0, Math.trunc(bought.quantity));
        if (!n) continue;
        const a = catalog.addons.find((x) => x.id === bought.addonId);
        if (!a) continue;
        if (a.kind === "module") {
            if (a.module === moduleId && !r.inc) {
                r.inc = true;
                r.text = "Add-on";
                r.limit = null;
                r.override = "Bought as an add-on";
            }
        } else if (a.kind === moduleId && r.inc && r.limit !== null) {
            r.limit += n * (a.mode === "unit" ? 1 : a.qty);
            r.override = r.override || "Raised by an add-on";
        }
    }

    r.state = r.inc ? "on" : r.off;

    const offered = offeredPlans(catalog);
    const at = offered.findIndex((p) => p.id === planId);
    const up = offered
        .slice(Math.max(at + 1, 0))
        .find((p) => cellOf(mod, p.id).inc);
    if (up) {
        r.upgradeTo = up.name;
        r.upgradePlanId = up.id;
        r.upgradePricePaise = up.pricePaise;
    }
    return r;
}

/** Every module in the business's version, resolved. */
export function resolveAllAccess(input: AccessInput): ModuleAccess[] {
    return input.catalog.modules.map((m) => resolveAccess(input, m.id));
}

/**
 * The state of a rail entry: the module that locks `menu` (and `child`, when
 * given), or on when no module does.
 */
export function menuState(
    input: AccessInput,
    menu: string,
    child?: string,
): ModuleAccess | { state: "on" } {
    const mod = input.catalog.modules.find(
        (m) => m.menu === menu && (child ? m.child === child : !m.child),
    );
    return mod ? resolveAccess(input, mod.id) : { state: "on" };
}

/** What the business pays a month before GST: a custom price, else its plan's. */
export function businessPricePaise(input: AccessInput): number {
    const custom = priceOverridePaise(input.overrides ?? [], input.now);
    if (custom !== null) return custom;
    const planId = effectivePlanId(
        input.planId,
        input.overrides ?? [],
        input.now,
        new Set(input.catalog.plans.map((p) => p.id)),
    );
    return input.catalog.plans.find((p) => p.id === planId)?.pricePaise ?? 0;
}

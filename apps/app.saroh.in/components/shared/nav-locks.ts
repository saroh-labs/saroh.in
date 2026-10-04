import type { BillingAccessView } from "@/lib/billing/access";
import { planLocks } from "@/lib/billing/access";
import type { ModuleView } from "@/lib/modules/schema";

import { NAV_GROUPS } from "./nav-items";

/**
 * The rail's plan locks (plans catalogue U14). A module shut only by the
 * plan (its one blocker `ENTITLEMENT_REQUIRED`) is locked, not off: it stays
 * in the rail with a lock, and its page says which plan has it
 * (`PlanLocked`) — never a row that silently vanished.
 */
export function planLockedModuleKeys(modules: readonly ModuleView[]): string[] {
    return modules
        .filter(
            (m) =>
                m.readiness === "DISABLED" &&
                m.blockers.length > 0 &&
                m.blockers.every((b) => b.code === "ENTITLEMENT_REQUIRED"),
        )
        .map((m) => m.key);
}

/**
 * The top-level rail addresses to draw locked: those of the plan-locked
 * modules, and the rows the catalogue itself names (`menu`, while limits are
 * enforced).
 */
export function lockedNavHrefs(
    lockedKeys: readonly string[],
    access: BillingAccessView | null,
): string[] {
    const keys = new Set(lockedKeys);
    const out = new Set<string>();
    for (const group of NAV_GROUPS) {
        for (const item of group.items) {
            if (item.moduleKey && keys.has(item.moduleKey)) out.add(item.href);
        }
    }
    for (const lock of planLocks(access)) out.add(lock.href);
    return Array.from(out);
}

import type { RegistryModuleKey } from "@saroh/pricing-catalog";
import { catalogueModulesFor } from "@saroh/pricing-catalog";
import { PlanLockedState } from "@saroh/ui/data-state";

import type { ModuleAccessView } from "@/lib/billing/access";
import { upgradeHref } from "@/lib/billing/access";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";

/**
 * A section the business's plan leaves out (plans catalogue U14): locked,
 * not off. `PlanLockedState` says which plan has it and the way there, and
 * that nothing it holds is gone. Never a dead end: someone who can change
 * the plan gets the link, anyone else who can.
 */
export async function PlanLocked({
    moduleKey,
    label,
    canManage,
}: {
    /** The registry module (`COMMERCE`, `APPOINTMENTS`, …). */
    moduleKey: string;
    label: string;
    canManage: boolean;
}) {
    const view = await billingAccessOrNull();
    const rows = new Set(catalogueModulesFor(moduleKey as RegistryModuleKey));
    const row: ModuleAccessView | undefined = view?.modules.find(
        (m) => rows.has(m.moduleId) && m.state === "locked",
    );
    return (
        <PlanLockedState
            name={label}
            plan={row?.upgradeTo?.name}
            href={upgradeHref(row?.upgradeTo?.planId)}
            canChangePlan={canManage}
        />
    );
}

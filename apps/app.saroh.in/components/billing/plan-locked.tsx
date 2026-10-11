import type { RegistryModuleKey } from "@saroh/pricing-catalog";
import { catalogueModulesFor } from "@saroh/pricing-catalog";

import type { ModuleAccessView } from "@/lib/billing/access";
import { upgradeHref } from "@/lib/billing/access";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { PlanLockedCard } from "./plan-way";

/**
 * A section the business's plan leaves out (plans catalogue U14): locked,
 * not off. `PlanLockedState` says which plan has it and the way there, and
 * that nothing it holds is gone. Never a dead end: someone who can change
 * the plan (`billing:manage`, said once by the shell) gets the link, anyone
 * else who can.
 */
export async function PlanLocked({
    moduleKey,
    label,
}: {
    /** The registry module (`COMMERCE`, `APPOINTMENTS`, …). */
    moduleKey: string;
    label: string;
}) {
    const view = await billingAccessOrNull();
    const rows = new Set(catalogueModulesFor(moduleKey as RegistryModuleKey));
    const row: ModuleAccessView | undefined = view?.modules.find(
        (m) => rows.has(m.moduleId) && m.state === "locked",
    );
    return (
        <PlanLockedCard
            name={label}
            plan={row?.upgradeTo?.name}
            href={upgradeHref(row?.upgradeTo?.planId)}
        />
    );
}

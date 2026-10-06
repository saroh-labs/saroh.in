import type { RegistryModuleKey } from "@saroh/pricing-catalog";
import { catalogueModulesFor } from "@saroh/pricing-catalog";
import { Button } from "@saroh/ui/button";
import { CapabilityOffState } from "@saroh/ui/data-state";
import { Lock } from "lucide-react";
import Link from "next/link";

import type { ModuleAccessView } from "@/lib/billing/access";
import { upgradeHref, upgradeLine } from "@/lib/billing/access";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";

/**
 * A section the business's plan leaves out (plans catalogue U14): locked,
 * not off — so it says which plan has it and the way there, and that
 * nothing it holds is gone. Never a dead end: the owner gets the upgrade,
 * anyone else who to ask.
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
    const plan = view?.plan?.name ?? "your";
    const line = row
        ? upgradeLine({ name: label, plan, upgradeTo: row.upgradeTo })
        : `${label} isn't in this business's plan.`;
    return (
        <CapabilityOffState
            icon={<Lock />}
            title={`${label} isn't in your plan`}
            description={`${line} Nothing it holds has been deleted; it's all here when you upgrade.`}
            action={
                canManage ? (
                    <Button asChild>
                        <Link href={upgradeHref(row?.upgradeTo?.planId)}>
                            {row?.upgradeTo
                                ? `See ${row.upgradeTo.name}`
                                : "See plans"}
                        </Link>
                    </Button>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        The owner can change the plan in Settings › Plan and
                        billing.
                    </p>
                )
            }
        />
    );
}

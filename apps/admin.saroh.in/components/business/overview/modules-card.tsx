import type { OverviewModules, OverviewPanel } from "@/lib/overview-words";

import { Facts } from "../../panel";
import { CardLink, OverviewCard } from "./overview-card";

/**
 * Modules (U3, R2): how many are on, off and locked as the business's
 * owner meets them (U1's resolver), and "Plan limits not enforced yet"
 * once. The fix for each lives on the Modules tab (U4 builds its sheet).
 */
export function ModulesCard({
    organizationId,
    modules,
}: {
    organizationId: string;
    modules: OverviewPanel<OverviewModules>;
}) {
    return (
        <OverviewCard id="modules" title="Modules" data={modules}>
            {(m) => (
                <div className="grid gap-3">
                    <Facts
                        rows={[
                            ["On", String(m.on)],
                            ["Off", String(m.off)],
                            ["Locked", String(m.locked)],
                        ]}
                    />
                    {m.note && (
                        <p className="text-sm text-muted-foreground">
                            {m.note}
                        </p>
                    )}
                    <CardLink organizationId={organizationId} tab="modules">
                        {m.off + m.locked > 0
                            ? "See what is off and why"
                            : "Open Modules"}
                    </CardLink>
                </div>
            )}
        </OverviewCard>
    );
}

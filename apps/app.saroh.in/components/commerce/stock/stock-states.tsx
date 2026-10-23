import { PageContainer } from "@/components/shared/page/page-container";
import { AccessDenied } from "@/components/shared/states/access-denied";
import { whoCanChange } from "@/components/shared/states/who-can-change";
import { ModuleOffState } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";
import { Boxes } from "lucide-react";

import { TurnOnTracking } from "./turn-on-tracking";

/**
 * The two states the Stock screen shows instead of its tabs (#527): a role
 * that can't read stock, and a business that doesn't track it.
 */

/** "You can't open stock", with who can change it. */
export function StockLocked({
    business,
    role,
}: {
    business: string;
    role: string;
}) {
    return (
        <AccessDenied {...whoCanChange({ thing: "Stock", business, role })} />
    );
}

/**
 * Track stock is off for the whole business (#515): nothing counts, so
 * there are no levels or log. Someone who may change products can turn it
 * on here; anyone else is told who can.
 */
export function StockTrackingOff({
    business,
    canChange,
}: {
    business: string | null;
    canChange: boolean;
}) {
    return (
        <PageContainer width="full">
            <PageHeader breadcrumb={["Sell", "Stock"]} title="Stock" />
            <div className="px-0 py-10 sm:py-[60px]">
                <ModuleOffState
                    className="mx-auto max-w-[560px]"
                    icon={<Boxes />}
                    name="Track stock"
                    title={
                        business
                            ? `Track stock is turned off for ${business}`
                            : "Track stock is turned off"
                    }
                    description="Products sell without a count, so there are no levels or log to show."
                    canTurnOn={canChange}
                    action={<TurnOnTracking />}
                    who="An owner or admin can turn it on."
                />
            </div>
        </PageContainer>
    );
}

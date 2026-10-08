"use client";

import type { PlansTab } from "@/lib/pricing-draft";
import type { AdminPricingImpact } from "@/lib/pricing-types";

import { DraftProvider, useDraft } from "./draft-store";
import { FirstRun } from "./first-run";
import type { PlansData } from "./plans-context";
import { PlansDataProvider, usePlans } from "./plans-context";
import { PlansNavProvider, PlansTabs } from "./plans-tabs";
import { StatusBar } from "./status-bar";
import { PlansToast } from "./toast";

/**
 * Plans & modules below its heading (plans catalogue U6): the status bar,
 * the tab row and the open tab, over the one shared draft. The page reads;
 * this holds the draft, the open tab and the toast for every tab. With no
 * catalogue at all (nothing live, no draft) it is the first-run screen,
 * over the Versions history when there is any to read.
 */
export function PlansShell({
    data,
    impact,
    tab,
}: {
    data: PlansData;
    impact: AdminPricingImpact | null;
    tab: PlansTab;
}) {
    return (
        <PlansDataProvider value={data}>
            <DraftProvider
                pricing={data.pricing}
                impact={impact}
                canEdit={data.access.canEdit}
                me={data.me}
            >
                <PlansNavProvider initialTab={tab}>
                    <PlansToast>
                        <Body />
                    </PlansToast>
                </PlansNavProvider>
            </DraftProvider>
        </PlansDataProvider>
    );
}

function Body() {
    const { catalog } = useDraft();
    const { pricing } = usePlans();
    if (!catalog) {
        return (
            <div className="grid min-w-0 gap-4">
                <FirstRun />
                {pricing.versions.length > 0 && <PlansTabs />}
            </div>
        );
    }
    return (
        <div className="grid min-w-0 gap-4">
            <StatusBar />
            <PlansTabs />
        </div>
    );
}

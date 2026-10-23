"use client";

import { cn } from "@saroh/ui/lib/utils";
import type { ReactNode } from "react";

import type { PlansTab } from "@/lib/pricing-draft";
import type { AdminPricingImpact } from "@/lib/pricing-types";

import { DraftProvider, useDraft } from "./draft-store";
import { FirstRun } from "./first-run";
import type { PlansData } from "./plans-context";
import { PlansDataProvider, usePlans } from "./plans-context";
import { PlansLiveHeader } from "./plans-header";
import { PlansNavProvider, PlansTabs } from "./plans-tabs";
import { PreviewProvider } from "./preview/preview-state";
import { StatusBar } from "./status-bar";
import { PlansToast } from "./toast";

/**
 * Plans and modules (plans catalogue U6; admin redesign U13): the heading
 * with what is live, the tab row and the open tab, over the one shared
 * draft, and the draft bar fixed at the foot while there is a draft. The
 * page reads; this holds the draft, the open tab, the previews and the
 * toast for every tab. With no catalogue at all (nothing live, no draft) it
 * is the first-run screen, over the Versions history when there is any.
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
                    <PreviewProvider>
                        <Toasts>
                            <Body />
                        </Toasts>
                    </PreviewProvider>
                </PlansNavProvider>
            </DraftProvider>
        </PlansDataProvider>
    );
}

/** The toast sits above the draft bar while there is one. */
function Toasts({ children }: { children: ReactNode }) {
    const { hasDraft } = useDraft();
    return <PlansToast raised={hasDraft}>{children}</PlansToast>;
}

function Body() {
    const { catalog, hasDraft } = useDraft();
    const { pricing } = usePlans();
    if (!catalog) {
        return (
            <div className="grid min-w-0 gap-4">
                <PlansLiveHeader />
                <FirstRun />
                {pricing.versions.length > 0 && <PlansTabs />}
            </div>
        );
    }
    return (
        // Room at the foot for the draft bar, so it never covers the last row.
        <div className={cn("grid min-w-0 gap-4", hasDraft && "pb-28")}>
            <PlansLiveHeader />
            <PlansTabs />
            <StatusBar />
        </div>
    );
}

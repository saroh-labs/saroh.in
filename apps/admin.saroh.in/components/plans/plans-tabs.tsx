"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@saroh/ui/tabs";
import type { ComponentType } from "react";

import type { PlansTab } from "@/lib/pricing-draft";
import { PLANS_TABS, tabFrom, tabLabels } from "@/lib/pricing-draft";

import { useDraft } from "./draft-store";
import { TabModules } from "./modules/tab-modules";
import { TabOffers } from "./offers/tab-offers";
import { usePlans } from "./plans-context";
import { usePlansNav } from "./plans-nav";
import { TabPlans } from "./plans/tab-plans";
import { TabPublish } from "./publish/tab-publish";
import { TabVersions } from "./versions/tab-versions";

/**
 * The tab row and its panels (plans catalogue U6; the design's "Tabbed"
 * direction). Tabs are in the URL (`?tab=plans|modules|offers|versions|
 * publish`, KTD-15), so one can be linked and survives a reload; switching
 * rewrites the address in place rather than asking the server again, which
 * would throw away a draft mid-save. Radix tabs, so the row is keyboard
 * reachable with the arrow keys, and it scrolls sideways on a phone.
 *
 * Each tab is its own file under `components/plans/<tab>/` (U7–U10), drawn
 * from `PANELS` below; a tab reads `usePlans()`, `useDraft()` and
 * `usePlansNav()` and needs nothing passed in.
 */

const PANELS: Record<PlansTab, ComponentType> = {
    plans: TabPlans,
    modules: TabModules,
    offers: TabOffers,
    versions: TabVersions,
    publish: TabPublish,
};

export { PlansNavProvider, usePlansNav } from "./plans-nav";
export type { PlansFocus, PlansNav } from "./plans-nav";

export function PlansTabs() {
    const { tab, setTab } = usePlansNav();
    const { pricing } = usePlans();
    const { hasDraft, check, live } = useDraft();
    const labels = tabLabels({
        versions: pricing.versions.length,
        hasDraft,
        changes: check.changes.length,
        firstVersion: live === null,
    });

    return (
        <Tabs
            value={tab}
            onValueChange={(next) => setTab(tabFrom(next))}
            className="grid min-w-0 gap-4"
        >
            <TabsList
                aria-label="Plans & modules"
                className="flex h-auto w-full justify-start gap-0.5 overflow-x-auto rounded-none border-b border-border bg-transparent p-0"
            >
                {PLANS_TABS.map((key) => (
                    <TabsTrigger
                        key={key}
                        value={key}
                        className="-mb-px shrink-0 rounded-none border-b-2 border-transparent px-3 py-[9px] text-[13px] font-medium text-muted-foreground hover:text-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none"
                    >
                        {labels[key]}
                    </TabsTrigger>
                ))}
            </TabsList>
            {PLANS_TABS.map((key) => {
                const Panel = PANELS[key];
                return (
                    <TabsContent
                        key={key}
                        value={key}
                        className="mt-0 min-w-0 rounded-[14px]"
                    >
                        <Panel />
                    </TabsContent>
                );
            })}
        </Tabs>
    );
}

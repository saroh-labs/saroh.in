import { Skeleton } from "@saroh/ui/skeleton";

import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/settings-panel";

/**
 * Plan and billing on its way: the page's own shape — Your plan, the plan
 * picker's rows, the coupon and the invoices — so nothing jumps when it
 * lands. It reads the plan, the price list and each trial's quote first.
 */
export default function Loading() {
    const card = "overflow-hidden rounded-xl border border-border bg-card";
    return (
        <SettingsPanel
            header={<SettingsPanelHeader title="Plan and billing" />}
        >
            <div
                aria-busy="true"
                aria-label="Loading plan and billing"
                className="grid max-w-[760px] gap-4"
            >
                <div className={`${card} grid gap-2 px-[18px] py-4`}>
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-7 w-48" />
                    <Skeleton className="h-3.5 w-64 max-w-full" />
                </div>
                <div className={card}>
                    <div className="border-b border-border/70 px-[18px] py-3">
                        <Skeleton className="h-3.5 w-72 max-w-full" />
                    </div>
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            className="flex items-center gap-3 border-t border-border/70 px-[18px] py-[13px] first:border-t-0"
                        >
                            <div className="grid flex-1 gap-1.5">
                                <Skeleton className="h-4 w-40" />
                                <Skeleton className="h-3 w-56 max-w-full" />
                            </div>
                            <Skeleton className="h-8 w-20" />
                        </div>
                    ))}
                </div>
                <div className={`${card} grid gap-2 px-[18px] py-3.5`}>
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-[34px] w-[180px]" />
                </div>
            </div>
        </SettingsPanel>
    );
}

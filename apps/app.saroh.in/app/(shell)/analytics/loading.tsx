import { Skeleton } from "@saroh/ui/skeleton";

import { PageLoading } from "@/components/shared/page-loading";
import { INSIGHTS_TABS, TAB_LABEL } from "@/lib/insights/period";

/**
 * Insights on its way (`IBLoadingD`, `IBLoadingP`): the real title and
 * tabs, a bar where the days line will be (the period isn't known here,
 * and a wrong date is worse than none), then the Overview's shape. The
 * tabs sit as close under the title as the page draws them.
 */
export default function Loading() {
    return (
        <PageLoading
            shape="answers"
            width="full"
            title="Insights"
            description={
                <Skeleton className="inline-block h-3.5 w-72 max-w-full align-middle" />
            }
            tabs={
                <div className="-mt-[18px] flex max-w-[1160px] gap-0.5 overflow-hidden border-b border-border">
                    {INSIGHTS_TABS.map((tab) => (
                        <span
                            key={tab}
                            className="shrink-0 whitespace-nowrap px-3.5 py-2.5 text-[14px] font-medium text-muted-foreground"
                        >
                            {TAB_LABEL[tab]}
                        </span>
                    ))}
                </div>
            }
            label="Loading Insights"
        />
    );
}

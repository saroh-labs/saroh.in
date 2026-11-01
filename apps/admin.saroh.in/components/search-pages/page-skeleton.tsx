import { PageContainer } from "@saroh/ui/page-container";
import { Skeleton } from "@saroh/ui/skeleton";

import { PanelSkeleton } from "@/components/states/panel-skeleton";

/**
 * A search page on its way (‹ Previous / Next ›, owner 1 Nov): the console
 * stays, and this page's own layout holds its place in grey: the header
 * with its actions on the right, the three tabs, the panels and the side
 * column, so nothing jumps when it arrives.
 */
export function SearchPageSkeleton() {
    return (
        <PageContainer width="full">
            <div aria-hidden className="mb-5 flex flex-wrap items-start gap-4">
                <div className="grid min-w-0 flex-1 gap-2.5">
                    <Skeleton className="h-3 w-64 max-w-full rounded-[4px]" />
                    <Skeleton className="h-8 w-56 rounded-[6px]" />
                    <Skeleton className="h-4 w-80 max-w-full rounded-[4px]" />
                </div>
                <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-32 rounded-md" />
                    <Skeleton className="h-8 w-36 rounded-md" />
                    <Skeleton className="h-8 w-40 rounded-md" />
                    <Skeleton className="h-8 w-9 rounded-md" />
                </div>
            </div>
            <div
                aria-hidden
                className="mb-5 flex gap-6 border-b border-border pb-2.5"
            >
                {[72, 64, 60].map((w) => (
                    <Skeleton key={w} className="h-5" style={{ width: w }} />
                ))}
            </div>
            <div className="flex flex-wrap items-start gap-4">
                <div className="grid min-w-0 flex-[999_1_560px] gap-4">
                    <PanelSkeleton label="Loading the search page" rows={3} />
                    <div aria-hidden>
                        <PanelSkeleton label="" rows={5} />
                    </div>
                </div>
                <div
                    aria-hidden
                    className="grid min-w-0 flex-[1_1_320px] gap-4"
                >
                    <PanelSkeleton label="" rows={4} />
                    <PanelSkeleton label="" rows={4} />
                </div>
            </div>
        </PageContainer>
    );
}

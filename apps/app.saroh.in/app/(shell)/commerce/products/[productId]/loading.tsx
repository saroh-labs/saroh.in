import { LoadingState } from "@saroh/ui/data-state";
import { Skeleton } from "@saroh/ui/skeleton";

import { PageContainer } from "@/components/shared/page-container";

/** The product page's shape — header, tabs, four numbers — while it loads. */
export default function Loading() {
    return (
        <PageContainer width="full">
            <div className="flex flex-col gap-5" aria-hidden>
                <div className="flex items-start gap-4">
                    <Skeleton className="size-14 rounded-[10px]" />
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-3 w-40" />
                        <Skeleton className="h-[30px] w-64" />
                        <Skeleton className="h-3 w-80 max-w-full" />
                    </div>
                </div>
                <div className="flex gap-3 border-b border-border pb-2.5">
                    {[80, 120, 60, 70, 60, 80].map((w, i) => (
                        <Skeleton
                            key={i}
                            className="h-4"
                            style={{ width: w }}
                        />
                    ))}
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2.5">
                    {[0, 1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-[82px] rounded-[11px]" />
                    ))}
                </div>
            </div>
            <LoadingState
                rows={4}
                label="Loading the product"
                className="mt-6"
            />
        </PageContainer>
    );
}

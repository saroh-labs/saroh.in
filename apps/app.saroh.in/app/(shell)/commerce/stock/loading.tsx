import { LoadingState } from "@saroh/ui/data-state";
import { Skeleton } from "@saroh/ui/skeleton";

import { PageContainer } from "@/components/shared/page-container";

/** The Stock screen's shape: its header, its three tabs, the chips, the table. */
export default function Loading() {
    return (
        <PageContainer width="full">
            <div className="flex flex-col gap-5" aria-hidden>
                <div className="space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-7 w-28" />
                    <Skeleton className="h-4 w-80 max-w-full" />
                </div>
                <div className="flex gap-4 border-b border-border pb-2.5">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-10" />
                    <Skeleton className="h-4 w-14" />
                </div>
                <div className="flex gap-2">
                    <Skeleton className="h-[30px] w-12 rounded-full" />
                    <Skeleton className="h-[30px] w-24 rounded-full" />
                </div>
            </div>
            <LoadingState rows={6} variant="list" label="Loading stock…" />
        </PageContainer>
    );
}

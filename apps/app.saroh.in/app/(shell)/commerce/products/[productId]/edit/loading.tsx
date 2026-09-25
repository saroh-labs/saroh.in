import { LoadingState } from "@saroh/ui/data-state";
import { Skeleton } from "@saroh/ui/skeleton";

import { PageContainer } from "@/components/shared/page-container";

/** The editor's shape — header, then the two columns — while it loads. */
export default function Loading() {
    return (
        <PageContainer width="full">
            <div className="flex flex-col gap-6" aria-hidden>
                <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-3 w-40" />
                        <Skeleton className="h-[30px] w-56" />
                    </div>
                    <Skeleton className="h-10 w-32 rounded-md" />
                </div>
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
                    <LoadingState rows={6} label="Loading the product" />
                    <LoadingState rows={4} />
                </div>
            </div>
        </PageContainer>
    );
}

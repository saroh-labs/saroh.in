import { LoadingState } from "@saroh/ui/data-state";
import { Skeleton } from "@saroh/ui/skeleton";

import { PageContainer } from "@/components/shared/page-container";

/**
 * The Website screen on its way: its heading, the site's line, the tabs and a
 * list, at the width the screen itself uses — so opening Website or switching
 * site does not flash a narrower, centred page before the real one lands.
 */
export default function Loading() {
    return (
        <PageContainer width="full">
            <div className="flex flex-col gap-6" aria-hidden>
                <div className="flex flex-col gap-5">
                    <div className="flex items-start justify-between gap-4">
                        <Skeleton className="h-[30px] w-40" />
                        <Skeleton className="h-[38px] w-44 rounded-md" />
                    </div>
                    <Skeleton className="-mt-3 h-5 w-64" />
                    <div className="flex gap-4 border-b border-border pb-3">
                        <Skeleton className="h-5 w-16" />
                        <Skeleton className="h-5 w-16" />
                        <Skeleton className="h-5 w-16" />
                    </div>
                </div>
            </div>
            <LoadingState
                variant="list"
                rows={4}
                label="Loading your website"
            />
        </PageContainer>
    );
}

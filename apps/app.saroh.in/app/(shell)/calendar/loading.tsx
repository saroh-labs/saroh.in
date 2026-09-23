import { LoadingState } from "@saroh/ui/data-state";
import { Skeleton } from "@saroh/ui/skeleton";

import { PageContainer } from "@/components/shared/page-container";

/** The calendar's shape while it arrives: heading, switches, month and day. */
export default function Loading() {
    return (
        <PageContainer width="full">
            <div className="space-y-3.5" aria-hidden>
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-[30px] w-60" />
                <Skeleton className="h-8 w-full max-w-md" />
            </div>
            <div className="flex flex-wrap items-start gap-4">
                <Skeleton className="h-[520px] min-w-0 flex-[3_1_460px] rounded-xl" />
                <LoadingState
                    rows={4}
                    variant="list"
                    label="Loading the calendar"
                    className="min-w-0 flex-[2_1_280px] max-[1099px]:min-[760px]:hidden"
                />
            </div>
        </PageContainer>
    );
}

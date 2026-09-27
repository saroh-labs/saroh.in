import { LoadingState } from "@saroh/ui/data-state";
import { Skeleton } from "@saroh/ui/skeleton";

import { PageContainer } from "@/components/shared/page-container";

/**
 * New order while it arrives: its heading and the form's blocks. Its own,
 * so it doesn't borrow the Orders list's rows (B7 gave the list one).
 */
export default function Loading() {
    return (
        <PageContainer width="form">
            <div className="mb-6 space-y-2" aria-hidden>
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-7 w-36" />
                <Skeleton className="h-4 w-80 max-w-full" />
            </div>
            <LoadingState rows={4} label="Loading the order form" />
        </PageContainer>
    );
}

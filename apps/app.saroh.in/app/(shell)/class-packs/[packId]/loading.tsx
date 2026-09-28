import { Skeleton } from "@saroh/ui/skeleton";

import { DetailCrumbs } from "@/components/class-packs/pack-detail/detail-crumbs";
import { PageContainer } from "@/components/shared/page-container";

/** The design's loading shape: a title, a line and a card. */
export default function Loading() {
    return (
        <PageContainer width="full" className="space-y-0 p-0 sm:p-0">
            <DetailCrumbs here="Pack" />
            <div
                role="status"
                aria-busy="true"
                aria-label="Loading"
                className="grid gap-2.5 px-6 py-5 max-[759px]:px-4"
            >
                <Skeleton className="h-[26px] w-[38%] rounded-[8px]" />
                <Skeleton className="h-3.5 w-[58%] rounded-[6px]" />
                <Skeleton className="h-[120px] rounded-[12px]" />
            </div>
        </PageContainer>
    );
}

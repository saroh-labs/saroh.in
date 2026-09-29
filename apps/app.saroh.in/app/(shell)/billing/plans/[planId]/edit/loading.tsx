import { Skeleton } from "@saroh/ui/skeleton";

import { PageContainer } from "@/components/shared/page-container";
import { PaymentsCrumbs } from "@/components/subscriptions/payments-crumbs";
import { PLANS_HREF } from "@/lib/subscriptions/plan-detail";

/** The Plan Editor design's loading shape: a title, a line and a card. */
export default function Loading() {
    return (
        <PageContainer width="full" className="space-y-0 p-0 sm:p-0">
            <PaymentsCrumbs
                here="Plan"
                trail={[{ href: PLANS_HREF, label: "Plans" }]}
            />
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

import { NotFound } from "@saroh/ui/not-found";

import { PageContainer } from "@/components/shared/page-container";
import { PaymentsCrumbs } from "@/components/subscriptions/payments-crumbs";
import { PLANS_HREF } from "@/lib/subscriptions/plan-detail";

/** The design's not-found: said plainly, with the way back to the plans. */
export default function NotFoundPage() {
    return (
        <PageContainer width="full" className="space-y-0 p-0 sm:p-0">
            <PaymentsCrumbs
                here="Plan"
                trail={[{ href: PLANS_HREF, label: "Plans" }]}
            />
            <div className="px-4 py-10 sm:px-6">
                <NotFound
                    variant="card"
                    title="That plan isn't here"
                    description="The link may be old, or the draft was deleted."
                    primary={{ href: PLANS_HREF, label: "Back to plans" }}
                />
            </div>
        </PageContainer>
    );
}

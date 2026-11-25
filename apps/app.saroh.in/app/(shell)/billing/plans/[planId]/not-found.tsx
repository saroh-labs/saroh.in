import { IntentLink } from "@saroh/ui/intent-link";
import { NotFound } from "@saroh/ui/not-found";
import { PageHeader } from "@saroh/ui/page-header";

import { PageContainer } from "@/components/shared/page/page-container";

import { PLANS_HREF } from "@/lib/subscriptions/plan-detail";

export const metadata = { title: "Plan not found" };

/** The design's not-found: said plainly, with the way back to the plans. */
export default function NotFoundPage() {
    return (
        <PageContainer width="full">
            <PageHeader
                breadcrumb={[
                    "Payments",
                    <IntentLink data-ph-unmask="" key="plans" href={PLANS_HREF}>
                        Plans
                    </IntentLink>,
                    "Not found",
                ]}
                title="Plan"
            />
            <div>
                <NotFound
                    variant="card"
                    title="Plan not found"
                    description="The link may be old, or the draft was deleted."
                    primary={{ href: PLANS_HREF, label: "Back to Plans" }}
                />
            </div>
        </PageContainer>
    );
}

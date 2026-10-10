import { NotFound } from "@saroh/ui/not-found";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { PageContainer } from "@/components/shared/page-container";

import { PLANS_HREF } from "@/lib/subscriptions/plan-detail";

/** The design's not-found: said plainly, with the way back to the plans. */
export default function NotFoundPage() {
    return (
        <PageContainer width="full">
            <PageHeader
                breadcrumb={[
                    "Payments",
                    <Link key="plans" href={PLANS_HREF}>
                        Plans
                    </Link>,
                    "Not found",
                ]}
                title="Plan"
            />
            <div>
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

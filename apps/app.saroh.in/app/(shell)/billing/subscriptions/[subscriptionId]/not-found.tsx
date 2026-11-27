import { IntentLink } from "@saroh/ui/intent-link";
import { NotFound } from "@saroh/ui/not-found";
import { PageHeader } from "@saroh/ui/page-header";

import { PageContainer } from "@/components/shared/page/page-container";

export const metadata = { title: "Subscription not found" };

/** The design's not-found: said plainly, with the way back. */
export default function NotFoundPage() {
    return (
        <PageContainer width="full">
            <PageHeader
                breadcrumb={[
                    <IntentLink
                        data-ph-unmask=""
                        key="list"
                        href="/billing/subscriptions"
                    >
                        Memberships
                    </IntentLink>,
                    "Not found",
                ]}
                title="Subscription"
            />
            <div>
                <NotFound
                    variant="card"
                    title="Subscription not found"
                    description="It may have been removed, or the link is wrong."
                    primary={{
                        href: "/billing/subscriptions",
                        label: "Back to Subscriptions",
                    }}
                />
            </div>
        </PageContainer>
    );
}

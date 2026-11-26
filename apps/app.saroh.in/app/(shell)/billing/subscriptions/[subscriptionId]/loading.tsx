import { IntentLink } from "@saroh/ui/intent-link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="detail"
            width="full"
            breadcrumb={[
                <IntentLink
                    data-ph-unmask=""
                    key="1"
                    href="/billing/subscriptions"
                >
                    Memberships
                </IntentLink>,
            ]}
            label="Loading the subscription"
        />
    );
}

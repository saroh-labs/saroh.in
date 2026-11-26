import { IntentLink } from "@saroh/ui/intent-link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="editor"
            width="full"
            breadcrumb={[
                <IntentLink
                    data-ph-unmask=""
                    key="1"
                    href="/billing/subscriptions?tab=plans"
                >
                    Membership plans
                </IntentLink>,
            ]}
            label="Loading the plan editor"
        />
    );
}

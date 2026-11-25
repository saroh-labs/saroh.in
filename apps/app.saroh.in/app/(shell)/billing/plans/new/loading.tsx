import { IntentLink } from "@saroh/ui/intent-link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="editor"
            width="full"
            breadcrumb={[
                "Payments",
                <IntentLink
                    data-ph-unmask=""
                    key="1"
                    href="/billing/subscriptions?tab=plans"
                >
                    Plans
                </IntentLink>,
                "New plan",
            ]}
            title="New plan"
            label="Loading the plan editor"
        />
    );
}

import { IntentLink } from "@saroh/ui/intent-link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="list"
            width="full"
            breadcrumb={[
                <IntentLink data-ph-unmask="" key="1" href="/commerce/orders">
                    Orders
                </IntentLink>,
                "Tickets",
            ]}
            label="Loading the tickets"
            rows={3}
        />
    );
}

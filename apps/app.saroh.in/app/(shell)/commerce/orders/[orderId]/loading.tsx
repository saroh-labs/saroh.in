import { IntentLink } from "@saroh/ui/intent-link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="detail"
            width="full"
            breadcrumb={[
                "Sell",
                <IntentLink data-ph-unmask="" key="1" href="/commerce/orders">
                    Orders
                </IntentLink>,
            ]}
            label="Loading the order"
        />
    );
}

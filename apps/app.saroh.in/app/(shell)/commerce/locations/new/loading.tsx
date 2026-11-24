import { IntentLink } from "@saroh/ui/intent-link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="form"
            width="form"
            breadcrumb={[
                "Sell",
                <IntentLink
                    data-ph-unmask=""
                    key="1"
                    href="/commerce/locations"
                >
                    Location
                </IntentLink>,
                "New",
            ]}
            title="New location"
            label="Loading the location form"
        />
    );
}

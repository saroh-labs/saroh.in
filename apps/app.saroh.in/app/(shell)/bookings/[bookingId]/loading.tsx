import { IntentLink } from "@saroh/ui/intent-link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="detail"
            width="default"
            breadcrumb={[
                <IntentLink data-ph-unmask="" key="0" href="/bookings">
                    Bookings
                </IntentLink>,
            ]}
            label="Loading the booking"
        />
    );
}

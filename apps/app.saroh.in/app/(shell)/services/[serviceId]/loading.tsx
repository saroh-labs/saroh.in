import { IntentLink } from "@saroh/ui/intent-link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="editor"
            width="full"
            breadcrumb={[
                <IntentLink data-ph-unmask="" key="0" href="/bookings">
                    Bookings
                </IntentLink>,
                <IntentLink data-ph-unmask="" key="1" href="/services">
                    Services
                </IntentLink>,
            ]}
            label="Loading the service"
        />
    );
}

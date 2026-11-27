import { IntentLink } from "@saroh/ui/intent-link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="form"
            width="form"
            breadcrumb={[
                <IntentLink
                    data-ph-unmask=""
                    key="1"
                    href="/commerce/customers"
                >
                    Customers
                </IntentLink>,
                "Import",
            ]}
            title="Import customers"
            label="Loading the import"
        />
    );
}

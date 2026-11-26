import { IntentLink } from "@saroh/ui/intent-link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="form"
            width="default"
            breadcrumb={[
                <IntentLink data-ph-unmask="" key="1" href="/commerce/products">
                    Products
                </IntentLink>,
                "Import",
            ]}
            title="Import products"
            label="Loading the import"
        />
    );
}

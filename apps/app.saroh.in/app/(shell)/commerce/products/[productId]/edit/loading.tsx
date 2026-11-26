import { IntentLink } from "@saroh/ui/intent-link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="editor"
            width="full"
            breadcrumb={[
                <IntentLink data-ph-unmask="" key="1" href="/commerce/products">
                    Products
                </IntentLink>,
            ]}
            label="Loading the product editor"
        />
    );
}

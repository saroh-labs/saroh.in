import { IntentLink } from "@saroh/ui/intent-link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="editor"
            width="full"
            breadcrumb={[
                "Payments",
                <IntentLink data-ph-unmask="" key="1" href="/billing/invoices">
                    Invoices
                </IntentLink>,
                "New invoice",
            ]}
            title="New invoice"
            label="Loading the invoice form"
        />
    );
}

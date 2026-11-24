import { IntentLink } from "@saroh/ui/intent-link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="form"
            width="form"
            breadcrumb={[
                <IntentLink data-ph-unmask="" key="0" href="/sites">
                    Website
                </IntentLink>,
                "New site",
            ]}
            title="New site"
            label="Loading the site form"
        />
    );
}

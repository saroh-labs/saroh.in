import { IntentLink } from "@saroh/ui/intent-link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="list"
            width="default"
            breadcrumb={[
                <IntentLink data-ph-unmask="" key="0" href="/sites">
                    Website
                </IntentLink>,
                "Version history",
            ]}
            title="Version history"
            label="Loading the versions"
        />
    );
}

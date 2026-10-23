import Link from "next/link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="editor"
            width="full"
            breadcrumb={[
                "Payments",
                <Link key="1" href="/billing/subscriptions?tab=plans">
                    Plans
                </Link>,
                "New plan",
            ]}
            title="New plan"
            label="Loading the plan editor"
        />
    );
}

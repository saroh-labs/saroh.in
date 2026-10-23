import Link from "next/link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="detail"
            width="full"
            breadcrumb={[
                "Payments",
                <Link key="1" href="/billing/subscriptions?tab=plans">
                    Plans
                </Link>,
            ]}
            label="Loading the plan"
        />
    );
}

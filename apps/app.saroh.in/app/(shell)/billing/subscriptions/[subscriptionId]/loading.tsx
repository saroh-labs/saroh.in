import Link from "next/link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="detail"
            width="full"
            breadcrumb={[
                "Payments",
                <Link key="1" href="/billing/subscriptions">
                    Subscriptions
                </Link>,
            ]}
            label="Loading the subscription"
        />
    );
}

import Link from "next/link";

import { PageLoading } from "@/components/shared/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="list"
            width="full"
            breadcrumb={[
                "Sell",
                <Link key="1" href="/commerce/orders">
                    Orders
                </Link>,
                "Tickets",
            ]}
            label="Loading the tickets"
            rows={3}
        />
    );
}

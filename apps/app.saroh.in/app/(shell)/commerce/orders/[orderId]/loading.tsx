import Link from "next/link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="detail"
            width="full"
            breadcrumb={[
                "Sell",
                <Link data-ph-unmask="" key="1" href="/commerce/orders">
                    Orders
                </Link>,
            ]}
            label="Loading the order"
        />
    );
}

import Link from "next/link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="detail"
            width="full"
            breadcrumb={[
                "Sell",
                <Link key="1" href="/commerce/products">
                    Products
                </Link>,
            ]}
            label="Loading the product"
        />
    );
}

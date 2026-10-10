import Link from "next/link";

import { PageLoading } from "@/components/shared/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="editor"
            width="full"
            breadcrumb={[
                "Sell",
                <Link key="1" href="/commerce/products">
                    Products
                </Link>,
                "New product",
            ]}
            title="New product"
            label="Loading the product editor"
        />
    );
}

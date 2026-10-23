import Link from "next/link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="form"
            width="default"
            breadcrumb={[
                "Sell",
                <Link key="1" href="/commerce/products">
                    Products
                </Link>,
                "Import",
            ]}
            title="Import products"
            label="Loading the import"
        />
    );
}

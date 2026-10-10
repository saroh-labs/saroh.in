import Link from "next/link";

import { PageLoading } from "@/components/shared/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="settings"
            width="wide"
            breadcrumb={[
                "Sell",
                <Link key="1" href="/commerce/products">
                    Products
                </Link>,
                "Settings",
            ]}
            title="Product settings"
            label="Loading product settings"
        />
    );
}

import Link from "next/link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="form"
            width="form"
            breadcrumb={[
                "Sell",
                <Link key="1" href="/commerce/customers">
                    Customers
                </Link>,
                "Import",
            ]}
            title="Import customers"
            label="Loading the import"
        />
    );
}

import Link from "next/link";

import { PageLoading } from "@/components/shared/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="form"
            width="full"
            breadcrumb={[
                "Payments",
                <Link key="1" href="/billing/invoices">
                    Invoices
                </Link>,
                "Draft",
            ]}
            title="Edit the draft"
            label="Loading the draft"
        />
    );
}

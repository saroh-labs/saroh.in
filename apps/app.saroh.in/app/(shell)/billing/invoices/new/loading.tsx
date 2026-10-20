import Link from "next/link";

import { PageLoading } from "@/components/shared/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="editor"
            width="full"
            breadcrumb={[
                "Payments",
                <Link key="1" href="/billing/invoices">
                    Invoices
                </Link>,
                "New invoice",
            ]}
            title="New invoice"
            label="Loading the invoice form"
        />
    );
}

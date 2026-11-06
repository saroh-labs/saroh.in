import Link from "next/link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="detail"
            width="full"
            breadcrumb={[
                "Payments",
                <Link data-ph-unmask="" key="1" href="/billing/invoices">
                    Invoices
                </Link>,
            ]}
            label="Loading the invoice"
        />
    );
}

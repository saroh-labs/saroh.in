import Link from "next/link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="editor"
            width="full"
            breadcrumb={[
                "Payments",
                <Link data-ph-unmask="" key="1" href="/billing/invoices">
                    Invoices
                </Link>,
                "Draft",
            ]}
            title="Edit the draft"
            label="Loading the draft"
        />
    );
}

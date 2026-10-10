import { PageLoading } from "@/components/shared/page-loading";
import { INVOICE_TABS } from "@/lib/invoices/status";

export default function Loading() {
    return (
        <PageLoading
            shape="list"
            width="full"
            breadcrumb={["Payments", "Invoices"]}
            title="Invoices"
            label="Loading invoices"
            tabs={INVOICE_TABS.map((t) => t.label)}
        />
    );
}

import { PageLoading } from "@/components/shared/page-loading";

/**
 * The Invoices list's own shape (DEC-173, U8 #1120): the header as the
 * page draws it (the compact bar on a phone), the GST line, the money
 * strip's four figures, then the search and rows, inside the shell.
 */
export default function Loading() {
    return (
        <PageLoading
            shape="money-list"
            width="full"
            compactOnPhone
            breadcrumb={["Payments", "Invoices"]}
            title="Invoices"
            label="Loading invoices"
        />
    );
}

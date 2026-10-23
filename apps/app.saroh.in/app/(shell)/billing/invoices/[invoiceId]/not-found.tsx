import { NotFound } from "@saroh/ui/not-found";

import { PageContainer } from "@/components/shared/page/page-container";

export const metadata = { title: "Invoice not found" };

/** An invoice that isn't here — never was, or is another business's. */
export default function NotFoundPage() {
    return (
        <PageContainer width="full">
            <NotFound
                variant="card"
                title="Invoice not found"
                description="It may belong to another business, or the link is wrong."
                primary={{
                    href: "/billing/invoices",
                    label: "Back to Invoices",
                }}
            />
        </PageContainer>
    );
}

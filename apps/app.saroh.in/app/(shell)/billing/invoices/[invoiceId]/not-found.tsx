import { NotFound } from "@saroh/ui/not-found";

import { PageContainer } from "@/components/shared/page-container";

/** An invoice that isn't here — never was, or is another business's. */
export default function NotFoundPage() {
    return (
        <PageContainer width="full">
            <NotFound
                variant="card"
                title="No invoice at this address"
                description="It may belong to another business, or the link is wrong."
                primary={{
                    href: "/billing/invoices",
                    label: "Back to invoices",
                }}
            />
        </PageContainer>
    );
}

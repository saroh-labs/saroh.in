import { NotFound } from "@saroh/ui/not-found";

import { PageContainer } from "@/components/shared/page-container";
import { PaymentsCrumbs } from "@/components/subscriptions/payments-crumbs";

/** The design's not-found: said plainly, with the way back. */
export default function NotFoundPage() {
    return (
        <PageContainer width="full" className="space-y-0 p-0 sm:p-0">
            <PaymentsCrumbs
                here="Not found"
                back={{
                    href: "/billing/subscriptions",
                    label: "Subscriptions",
                }}
            />
            <div className="px-4 py-10 sm:px-6">
                <NotFound
                    variant="card"
                    title="No subscription here"
                    description="It may have been removed, or the link is wrong."
                    primary={{
                        href: "/billing/subscriptions",
                        label: "Back to subscriptions",
                    }}
                />
            </div>
        </PageContainer>
    );
}

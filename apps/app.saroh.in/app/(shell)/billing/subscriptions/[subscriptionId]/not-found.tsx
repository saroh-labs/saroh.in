import { NotFound } from "@saroh/ui/not-found";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { PageContainer } from "@/components/shared/page-container";

/** The design's not-found: said plainly, with the way back. */
export default function NotFoundPage() {
    return (
        <PageContainer width="full">
            <PageHeader
                breadcrumb={[
                    "Payments",
                    <Link key="list" href="/billing/subscriptions">
                        Subscriptions
                    </Link>,
                    "Not found",
                ]}
                title="Subscription"
            />
            <div>
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

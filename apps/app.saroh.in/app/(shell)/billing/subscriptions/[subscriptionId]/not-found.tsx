import Link from "next/link";

import { PageContainer } from "@/components/shared/page-container";
import { PaymentsCrumbs } from "@/components/subscriptions/payments-crumbs";

/** The design's not-found: said plainly, with the way back. */
export default function NotFound() {
    return (
        <PageContainer width="full" className="space-y-0 p-0 sm:p-0">
            <PaymentsCrumbs
                here="Not found"
                back={{
                    href: "/billing/subscriptions",
                    label: "Subscriptions",
                }}
            />
            <div className="px-[22px] py-[60px] text-center">
                <h1 className="font-display text-[18px] font-semibold">
                    No subscription here
                </h1>
                <p className="mt-1 text-[13px] text-muted-foreground">
                    It may have been removed, or the link is wrong.
                </p>
                <Link
                    href="/billing/subscriptions"
                    className="mt-2.5 inline-block text-[13px] font-semibold text-brand hover:text-foreground"
                >
                    Back to subscriptions
                </Link>
            </div>
        </PageContainer>
    );
}

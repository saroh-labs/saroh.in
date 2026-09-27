import Link from "next/link";

import { PageContainer } from "@/components/shared/page-container";
import { PaymentsCrumbs } from "@/components/subscriptions/payments-crumbs";
import { PLANS_HREF } from "@/lib/subscriptions/plan-detail";

/** The design's not-found: said plainly, with the way back to the plans. */
export default function NotFound() {
    return (
        <PageContainer width="full" className="space-y-0 p-0 sm:p-0">
            <PaymentsCrumbs
                here="Plan"
                trail={[{ href: PLANS_HREF, label: "Plans" }]}
            />
            <div className="px-6 py-10">
                <div className="rounded-[12px] border border-dashed border-border-strong px-5 py-[34px] text-center">
                    <h1 className="text-[15px] font-semibold">
                        That plan isn&apos;t here
                    </h1>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                        The link may be old, or the draft was deleted.
                    </p>
                    <Link
                        href={PLANS_HREF}
                        className="mt-2 inline-block text-[13px] font-semibold text-brand hover:text-foreground"
                    >
                        Back to plans
                    </Link>
                </div>
            </div>
        </PageContainer>
    );
}

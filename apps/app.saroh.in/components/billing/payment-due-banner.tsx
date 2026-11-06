import { Button } from "@saroh/ui/button";
import { Notice } from "@saroh/ui/notice";
import Link from "next/link";

import { ViewerDate } from "@/components/shared/dates/viewer-date";
import type { BillingAccessView } from "@/lib/billing/access";
import { plansShown } from "@/lib/saroh-billing/plans-shown";

/** Where Pay now goes: Plan and billing, opened on the payment that's due. */
export const PAY_DUE_HREF = "/settings/billing#pay-due";

/**
 * A renewal that wasn't paid (DEC-210): the card or autopay it was paid
 * with failed, so the payment is due, and the plan stays until the date,
 * then Free. Shown above every page, first of the plan banners, with Pay
 * now. Nothing when nothing is due, the role can't read billing, or plans
 * aren't shown (DEC-136).
 */
export function PaymentDueBanner({
    due,
}: {
    due: BillingAccessView["paymentDue"] | undefined;
}) {
    if (!due || !plansShown()) return null;
    return (
        <Notice
            tone="warning"
            layout="banner"
            // Saroh's words and plan name; the date's digits stay hidden.
            data-ph-unmask=""
            align="center"
        >
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
                <p className="min-w-0 flex-[1_1_320px] text-pretty text-[13px] leading-normal text-foreground">
                    <span className="font-semibold">
                        Your payment for {due.planName} didn&rsquo;t go through
                    </span>
                    . The card or autopay it was paid with failed. Pay by{" "}
                    <ViewerDate iso={due.dueBy} /> to keep {due.planName}; after
                    that you move to Free, and everything you made is kept.
                </p>
                <Button asChild size="sm" className="shrink-0">
                    <Link href={PAY_DUE_HREF}>Pay now</Link>
                </Button>
            </div>
        </Notice>
    );
}

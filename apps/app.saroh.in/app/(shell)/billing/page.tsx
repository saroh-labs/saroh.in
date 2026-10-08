import { redirect } from "next/navigation";

import { membershipPlansLock } from "@/lib/billing/access";
import { billingLanding } from "@/lib/invoices/access";
import { paymentsModuleOn } from "@/lib/invoices/payments-on";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";

/**
 * Billing has no page of its own: its screens are the children in the rail,
 * as Sell's are under `/commerce`. The Billing row lands on Subscriptions;
 * where Subscriptions can't be shown — Payments off (DEC-070), a role that
 * reads invoices but not subscriptions, or a plan that locks memberships
 * (UX-047) — it lands on Invoices. The plan is read best-effort: unread, it
 * lands as before and Subscriptions says what its plan allows.
 */
export default async function BillingPage() {
    const [paymentsOn, organization, access] = await Promise.all([
        paymentsModuleOn(),
        resolveActiveOrganization().catch(() => null),
        billingAccessOrNull(),
    ]);
    redirect(
        billingLanding(
            organization,
            paymentsOn,
            membershipPlansLock(access) !== null,
        ),
    );
}

import { redirect } from "next/navigation";

import { billingLanding } from "@/lib/invoices/access";
import { paymentsModuleOn } from "@/lib/invoices/payments-on";
import { resolveActiveOrganization } from "@/lib/organizations/service";

/**
 * Billing has no page of its own: its screens are the children in the rail,
 * as Sell's are under `/commerce`. The Billing row lands on Subscriptions;
 * where Subscriptions can't be shown — Payments off (DEC-070), or a role
 * that reads invoices but not subscriptions — it lands on Invoices.
 */
export default async function BillingPage() {
    const [paymentsOn, organization] = await Promise.all([
        paymentsModuleOn(),
        resolveActiveOrganization().catch(() => null),
    ]);
    redirect(billingLanding(organization, paymentsOn));
}

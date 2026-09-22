import { redirect } from "next/navigation";

/**
 * Billing has no page of its own: its screens are the children in the rail,
 * as Sell's are under `/commerce`. The Billing row lands on Subscriptions.
 */
export default function BillingPage() {
    redirect("/billing/subscriptions");
}

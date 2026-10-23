import { redirect } from "next/navigation";

/** Billing lands on its subscriptions (R25). */
export default function BillingPage(): never {
    redirect("/billing/subscriptions");
}

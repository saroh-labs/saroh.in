import { redirect } from "next/navigation";

/** Billing opens on its invoices (DEC-163). */
export default function BillingPage(): never {
    redirect("/billing/invoices");
}

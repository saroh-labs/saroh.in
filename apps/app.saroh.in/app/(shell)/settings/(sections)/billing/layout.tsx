import { notFound } from "next/navigation";

import { plansShown } from "@/lib/saroh-billing/plans-shown";

/**
 * Settings › Plan and billing exists only while plans are shown (DEC-136,
 * `plansShown`). Otherwise its address is the app's not-found, answered
 * here, above the section's own loading and error boundaries, so neither
 * names the page first.
 */
export default function PlanBillingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    if (!plansShown()) notFound();
    return children;
}

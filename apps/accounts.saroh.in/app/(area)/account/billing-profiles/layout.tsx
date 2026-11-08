import type { ReactNode } from "react";

import { billingProfilesOrNotFound } from "@/lib/saroh-billing";

/** Every Billing profiles page is not found where Saroh doesn't bill. */
export default function BillingProfilesLayout({
    children,
}: {
    children: ReactNode;
}) {
    billingProfilesOrNotFound();
    return children;
}

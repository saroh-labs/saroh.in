import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import { Suspense } from "react";

import { AdminShell } from "@/components/admin-shell";
import { BillingToolbar } from "@/components/billing/billing-toolbar";
import { getBillingCounts } from "@/lib/billing";
import { requireStaff } from "@/lib/console";

/**
 * Billing as one page (R25): one header, four tabs as routes with their
 * counts, and one search for every tab. Each tab's page draws only its own
 * list; its filters apply as they are picked. Needs `saroh-billing:read`
 * (Platform Owners and Billing); the API checks it again on every read.
 * Staff without it get the refusal inside the shell, and no tab is drawn.
 */
export default async function BillingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const gate = await requireStaff("saroh-billing:read");
    if (!gate.ok) return gate.screen;
    // Counts that can't be read say "—"; the tab's own list still loads.
    const counts = await getBillingCounts().catch(() => null);

    return (
        <AdminShell staff={gate.staff}>
            <PageContainer width="wide">
                <PageHeader
                    breadcrumb={["Billing"]}
                    title="Billing"
                    description="Saroh's own plans, invoices and payments, across every business. Dates are in India time."
                />
                <Suspense fallback={null}>
                    <BillingToolbar counts={counts} />
                </Suspense>
                {children}
            </PageContainer>
        </AdminShell>
    );
}

import { InvoicesScreen } from "@/components/invoices/invoices-screen";
import { PageContainer } from "@/components/shared/page-container";
import { listInvoices } from "@/lib/invoices/service";
import { tabFromView } from "@/lib/invoices/status";
import { getInvoiceBusiness } from "@/lib/invoices/tax";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { sinceParam } from "@/lib/views/since";

export const metadata = { title: "Invoices" };

/**
 * Payments → Invoices. The newest and every unpaid one; the tabs filter in
 * the browser, and `?view=` keeps the tab in the address.
 */
export default async function InvoicesPage({
    searchParams,
}: {
    searchParams: Promise<{ view?: string; since?: string }>;
}) {
    await requireSession();
    const [
        { rows: invoices, truncated },
        organization,
        business,
        { view, since },
    ] = await Promise.all([
        listInvoices(),
        resolveActiveOrganization(),
        getInvoiceBusiness(),
        searchParams,
    ]);
    const canWrite = organization?.actions
        ? organization.actions.includes("invoice:write")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";

    return (
        <PageContainer width="full">
            <InvoicesScreen
                invoices={invoices}
                truncated={truncated}
                canWrite={canWrite}
                businessName={organization?.name ?? "This business"}
                tax={
                    business
                        ? {
                              registered: business.registered,
                              gstin: business.gstin,
                          }
                        : null
                }
                initialTab={tabFromView(view)}
                // From Home's "Last 24 hours" (F6): the invoices paid since.
                paidSince={sinceParam({ since })}
            />
        </PageContainer>
    );
}

import { InvoicesScreen } from "@/components/invoices/invoices-screen";
import { PageContainer } from "@/components/shared/page-container";
import { listInvoices, listInvoicesPaidSince } from "@/lib/invoices/service";
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
    const { view, since } = await searchParams;
    const paidSince = sinceParam({ since });
    const [{ rows: invoices, truncated }, organization, business, paid] =
        await Promise.all([
            listInvoices(),
            resolveActiveOrganization(),
            getInvoiceBusiness(),
            // Asked of the API (H-7): an old invoice paid today is past the
            // newest page `listInvoices` reads.
            paidSince ? listInvoicesPaidSince(paidSince) : null,
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
                paidSince={paidSince}
                paidSinceInvoices={paid}
            />
        </PageContainer>
    );
}

import { InvoicesScreen } from "@/components/invoices/invoices-screen";
import { PaymentsLocked } from "@/components/invoices/payments-locked";
import { PageContainer } from "@/components/shared/page-container";
import { mayRead, paymentsLockedCopy } from "@/lib/invoices/access";
import {
    listInvoicesIn,
    scopeFromQuery,
    scopeWithName,
} from "@/lib/invoices/scope";
import { listInvoices, listInvoicesPaidSince } from "@/lib/invoices/service";
import { chipFromQuery } from "@/lib/invoices/sources";
import { tabFromView } from "@/lib/invoices/status";
import { getInvoiceBusiness } from "@/lib/invoices/tax";
import { invoiceZone } from "@/lib/invoices/zone";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { sinceParam } from "@/lib/views/since";

export const metadata = { title: "Invoices" };

/**
 * Payments → Invoices. The newest and every unpaid one; the tabs and the
 * source chips filter in the browser, and `?view=` and `?source=` keep
 * them in the address. `?pack=` or `?course=` (Pack and Course Detail)
 * asks the API for that one's invoices instead (D18).
 *
 * A role without the read gets the design's locked card before anything
 * is read (D18), rather than the generic denial a 403 brings.
 */
export default async function InvoicesPage({
    searchParams,
}: {
    searchParams: Promise<{
        view?: string;
        since?: string;
        source?: string;
        pack?: string;
        course?: string;
    }>;
}) {
    await requireSession();
    const [query, organization] = await Promise.all([
        searchParams,
        resolveActiveOrganization(),
    ]);
    if (organization && !mayRead(organization, "invoice:read")) {
        return (
            <PaymentsLocked {...paymentsLockedCopy(organization, "invoices")} />
        );
    }
    const { view, since } = query;
    const paidSince = sinceParam({ since });
    const only = scopeFromQuery(query);
    const [{ rows: invoices, truncated }, business, paid, scope] =
        await Promise.all([
            only ? listInvoicesIn(only) : listInvoices(),
            getInvoiceBusiness(),
            // Asked of the API (H-7): an old invoice paid today is past the
            // newest page `listInvoices` reads.
            paidSince ? listInvoicesPaidSince(paidSince) : null,
            only ? scopeWithName(only) : null,
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
                initialChip={chipFromQuery(query.source)}
                scope={scope}
                // From Home's "Last 24 hours" (F6): the invoices paid since.
                paidSince={paidSince}
                paidSinceInvoices={paid}
                // Dates as the paper prints them: the business's zone (#836).
                timeZone={invoiceZone(business)}
            />
        </PageContainer>
    );
}

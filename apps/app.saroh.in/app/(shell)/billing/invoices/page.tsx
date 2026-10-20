import { InvoicesScreen } from "@/components/invoices/invoices-screen";
import { PaymentsLocked } from "@/components/invoices/payments-locked";
import { PageContainer } from "@/components/shared/page-container";
import { readMissingRates } from "@/lib/gst-rates/service";
import { mayRead, paymentsLockedCopy } from "@/lib/invoices/access";
import { listQueryFrom, readsOnServer } from "@/lib/invoices/list-view";
import {
    listInvoicesIn,
    scopeFromQuery,
    scopeWithName,
} from "@/lib/invoices/scope";
import {
    listInvoices,
    listInvoicesBy,
    listInvoicesPaidSince,
    readInvoiceSummary,
} from "@/lib/invoices/service";
import { chipFromQuery } from "@/lib/invoices/sources";
import { getInvoiceBusiness } from "@/lib/invoices/tax";
import { invoiceZone } from "@/lib/invoices/zone";
import { permits } from "@/lib/organizations/permits";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { sinceParam } from "@/lib/views/since";

export const metadata = { title: "Invoices" };

/**
 * Payments → Invoices (DEC-173, U8 #1120). The newest and every unpaid
 * one; the status and the source filter in the browser, and `?tab=` and
 * `?source=` keep them in the address. The API answers what the newest
 * page can't (`readsOnServer`): a search (`?q=`), the cheques not in the
 * bank (`?view=cheques`, Home's link) and Paid this month (`?paidFrom=`),
 * however old the invoice. `?pack=` or `?course=` (Pack and Course
 * Detail) asks for that one's invoices (D18).
 *
 * The money strip is its own read (`GET invoices/summary`): when it
 * fails, the strip says so and the list still loads.
 *
 * A role without the read gets the design's locked card before anything
 * is read (D18), rather than the generic denial a 403 brings.
 */
export default async function InvoicesPage({
    searchParams,
}: {
    searchParams: Promise<{
        tab?: string;
        /** The status's name before `?tab=`, and the strip's `owed`/`cheques`. */
        view?: string;
        since?: string;
        source?: string;
        pack?: string;
        course?: string;
        q?: string;
        paidFrom?: string;
    }>;
}) {
    await requireSession();
    const [params, organization] = await Promise.all([
        searchParams,
        resolveActiveOrganization(),
    ]);
    if (organization && !mayRead(organization, "invoice:read")) {
        return (
            <PaymentsLocked {...paymentsLockedCopy(organization, "invoices")} />
        );
    }
    const query = listQueryFrom(params);
    const paidSince = sinceParam({ since: params.since });
    const only = scopeFromQuery(params);
    const narrowedRead = readsOnServer(query)
        ? listInvoicesBy({
              q: query.q,
              view: query.cheques ? "cheques" : undefined,
              paidFrom: query.paidFrom ?? undefined,
              ...(only?.kind === "pack" ? { packId: only.id } : {}),
              ...(only?.kind === "course" ? { courseId: only.id } : {}),
          })
        : null;
    const [
        { rows: invoices, truncated },
        business,
        paid,
        scope,
        missingRates,
        summary,
    ] = await Promise.all([
        narrowedRead ?? (only ? listInvoicesIn(only) : listInvoices()),
        getInvoiceBusiness(),
        // Asked of the API (H-7): an old invoice paid today is past the
        // newest page `listInvoices` reads.
        paidSince ? listInvoicesPaidSince(paidSince) : null,
        only ? scopeWithName(only) : null,
        // What is on sale with no GST rate; null says nothing of it.
        readMissingRates(),
        // The money strip; null when it couldn't be read.
        readInvoiceSummary(),
    ]);
    const canWrite = permits(organization, "invoice:write");

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
                query={query}
                initialChip={chipFromQuery(params.source)}
                scope={scope}
                // From Home's "Last 24 hours" (F6): the invoices paid since.
                paidSince={paidSince}
                paidSinceInvoices={paid}
                // Dates as the paper prints them: the business's zone (#836).
                timeZone={invoiceZone(business)}
                missingRates={missingRates}
                summary={summary}
            />
        </PageContainer>
    );
}

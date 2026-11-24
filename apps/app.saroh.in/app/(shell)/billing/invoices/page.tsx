import { dehydrate, HydrationBoundary } from "@tanstack/react-query";

import { InvoicesContainer } from "@/components/invoices/list/invoices-container";
import { PaymentsLocked } from "@/components/invoices/locked/payments-locked";
import { PageContainer } from "@/components/shared/page/page-container";
import { readMissingRates } from "@/lib/gst-rates/service";
import { mayRead, paymentsLockedCopy } from "@/lib/invoices/access";
import {
    invoicesListServer,
    invoicesSummaryServer,
} from "@/lib/invoices/access-server";
import { paymentsModuleOn } from "@/lib/invoices/payments-on";
import { invoicesAsk } from "@/lib/invoices/queries";
import { getInvoiceBusiness } from "@/lib/invoices/tax";
import { invoiceZone } from "@/lib/invoices/zone";
import { permits } from "@/lib/organizations/permits";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { prefetchRead } from "@/lib/query/prefetch";
import { getServerQueryClient } from "@/lib/query/server-client";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Invoices" };

/**
 * Payments → Invoices (DEC-173, U8 #1120). The newest and every unpaid
 * one; the status and the source filter in the browser, and `?tab=` and
 * `?source=` keep them in the address. The API answers what the newest
 * page can't (`readsOnServer`): a search (`?q=`), the cheques not in the
 * bank (`?view=cheques`, Home's link) and Paid this month (`?paidFrom=`),
 * however old the invoice. `?pack=` or `?course=` (Pack and Course
 * Detail) asks for that one's invoices (D18). `?date=` (or `?date=custom`
 * with `?from=`/`?to=`) is the day it was issued, also the API's.
 *
 * The money strip is its own read (`GET invoices/summary`): when it
 * fails, the strip says so and the list still loads.
 *
 * A role without the read gets the design's locked card before anything
 * is read (D18), rather than the generic denial a 403 brings.
 *
 * On React Query (DEC-259): the gate and the business's facts (GST standing,
 * zone, rates missing, Payments on) are the page's; the list as the address
 * asks (`/api/invoices`) and the strip (`/api/invoices/summary`) are
 * prefetched together and hydrated, and `InvoicesContainer` reads every
 * later one in place.
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
        /** The issued date: a preset, or `custom` with `from`/`to`. */
        date?: string;
        from?: string;
        to?: string;
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
    const client = getServerQueryClient();
    const [business, missingRates, paymentsOn] = await Promise.all([
        getInvoiceBusiness(),
        // What is on sale with no GST rate; null says nothing of it.
        readMissingRates(),
        paymentsModuleOn(),
        // The list and the strip, handed to the browser's queries. A failed
        // read is the container's to say: the list's is the page failing
        // (`error.tsx`), the strip's its own "Couldn't load totals".
        organization
            ? prefetchRead(
                  client,
                  invoicesListServer,
                  organization.id,
                  invoicesAsk(params),
              )
            : null,
        organization
            ? prefetchRead(client, invoicesSummaryServer, organization.id, {})
            : null,
    ]);
    const canWrite = permits(organization, "invoice:write");

    return (
        <PageContainer width="full">
            <HydrationBoundary state={dehydrate(client)}>
                <InvoicesContainer
                    canWrite={canWrite}
                    tax={
                        business
                            ? {
                                  registered: business.registered,
                                  gstin: business.gstin,
                              }
                            : null
                    }
                    // Dates as the paper prints them: the business's zone (#836).
                    timeZone={invoiceZone(business)}
                    missingRates={missingRates}
                    paymentsOn={paymentsOn}
                    // Signs a reminder's preview in Remind many (U12).
                    businessName={organization?.name ?? "This business"}
                />
            </HydrationBoundary>
        </PageContainer>
    );
}

import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";

import { InvoiceDetailContainer } from "@/components/invoices/details/invoice-detail-container";
import { PaymentsLocked } from "@/components/invoices/locked/payments-locked";
import { PageContainer } from "@/components/shared/page/page-container";
import { mayRead, paymentsLockedCopy } from "@/lib/invoices/access";
import { invoiceServer, readInvoiceOnce } from "@/lib/invoices/access-server";
import { invoiceRead } from "@/lib/invoices/queries";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { recordTitle } from "@/lib/page-title";
import { ReadFailed } from "@/lib/query/client";
import { prefetchRead } from "@/lib/query/prefetch";
import { getServerQueryClient } from "@/lib/query/server-client";
import { requireSession } from "@/lib/session";

/**
 * "Invoice INV-0042" in the tab (a credit note says so): its number, never
 * who it is billed to or its amount. A draft has no number yet: "Invoice".
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ invoiceId: string }>;
}) {
    const { invoiceId } = await params;
    return recordTitle(
        () => readInvoiceOnce(invoiceId),
        (invoice) =>
            invoice.number
                ? `${invoice.kind === "CREDIT_NOTE" ? "Credit note" : "Invoice"} ${invoice.number}`
                : null,
        "Invoice",
    );
}

/**
 * Payments → Invoices → one invoice (DEC-173, U9 #1121, INVPageA): the
 * details the list's side sheet shows, as a page — for a deep link, Home,
 * and a customer's invoices. The tax invoice (a GST-registered business) or
 * receipt as the customer gets it, the money card with the state's one main
 * button, Share and More, what happened, and what it is connected to.
 * Print leaves only the paper.
 *
 * On React Query (DEC-259): the gate is decided here; the invoice's details
 * (`/api/invoices/[invoiceId]`, the same read as the side sheet's) are
 * prefetched and hydrated, and `InvoiceDetailContainer` draws the page.
 */
export default async function InvoicePage({
    params,
}: {
    params: Promise<{ invoiceId: string }>;
}) {
    await requireSession();
    const [{ invoiceId }, organization] = await Promise.all([
        params,
        resolveActiveOrganization(),
    ]);
    // A role without the read gets the design's locked card before the
    // invoice is read (D18), rather than the generic denial its 403 brings.
    if (organization && !mayRead(organization, "invoice:read")) {
        return (
            <PaymentsLocked {...paymentsLockedCopy(organization, "invoices")} />
        );
    }
    if (!organization) notFound();
    const client = getServerQueryClient();
    const ask = { invoiceId };
    await prefetchRead(client, invoiceServer, organization.id, ask);
    const query = client.getQueryState(
        invoiceRead.options(organization.id, ask).queryKey,
    );
    // Missing, or another business's. A read that failed otherwise is the
    // page failing (`error.tsx`), as before.
    if (query?.error instanceof ReadFailed && query.error.status === 404) {
        notFound();
    }
    if (query?.status === "error") {
        throw query.error ?? new Error("The invoice couldn't be read");
    }

    return (
        <PageContainer width="full">
            <HydrationBoundary state={dehydrate(client)}>
                <InvoiceDetailContainer ask={ask} />
            </HydrationBoundary>
        </PageContainer>
    );
}

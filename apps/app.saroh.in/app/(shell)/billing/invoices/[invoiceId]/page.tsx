import { notFound } from "next/navigation";
import { cache } from "react";

import { InvoiceDetail } from "@/components/invoices/invoice-detail";
import { PaymentsLocked } from "@/components/invoices/payments-locked";
import { PageContainer } from "@/components/shared/page-container";
import { mayRead, paymentsLockedCopy } from "@/lib/invoices/access";
import { readInvoiceDetails } from "@/lib/invoices/details";
import { getInvoice } from "@/lib/invoices/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { recordTitle } from "@/lib/page-title";
import { requireSession } from "@/lib/session";

// One read for the tab's title and the page.
const readInvoice = cache((invoiceId: string) => getInvoice(invoiceId));

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
        () => readInvoice(invoiceId),
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
    const details = await readInvoiceDetails(invoiceId, readInvoice);
    if (!details) notFound();

    return (
        <PageContainer width="full">
            <InvoiceDetail details={details} />
        </PageContainer>
    );
}

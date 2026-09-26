import { notFound, redirect } from "next/navigation";

import { InvoiceCrumbs } from "@/components/invoices/invoice-crumbs";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { PageContainer } from "@/components/shared/page-container";
import { contactPickerOptions } from "@/lib/invoices/contacts";
import { getInvoice } from "@/lib/invoices/service";
import { getInvoiceBusiness, hasPaymentProvider } from "@/lib/invoices/tax";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Edit invoice" };

/** A draft, changed. An issued invoice cannot be, so it goes to its own page. */
export default async function EditInvoicePage({
    params,
}: {
    params: Promise<{ invoiceId: string }>;
}) {
    await requireSession();
    const { invoiceId } = await params;
    const [invoice, contacts, business, provider, organization] =
        await Promise.all([
            getInvoice(invoiceId),
            contactPickerOptions(),
            getInvoiceBusiness(),
            hasPaymentProvider(),
            resolveActiveOrganization(),
        ]);
    if (!invoice) notFound();
    if (invoice.status !== "DRAFT") redirect(`/billing/invoices/${invoice.id}`);

    return (
        <PageContainer width="full">
            <div>
                <InvoiceCrumbs current="Draft" />
                <h1 className="mb-1 font-display text-[28px] font-semibold tracking-[-0.02em]">
                    Edit the draft
                </h1>
                <p className="mb-4 text-[12.5px] text-muted-foreground">
                    It has no number yet, so everything on it can still change.
                </p>
                <InvoiceForm
                    contacts={contacts}
                    defaultCurrency={invoice.currency}
                    draft={invoice}
                    registered={
                        invoice.gst != null || (business?.registered ?? false)
                    }
                    businessName={organization?.name ?? "This business"}
                    providerConnected={provider}
                />
            </div>
        </PageContainer>
    );
}

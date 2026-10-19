import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { InvoiceForm } from "@/components/invoices/invoice-form";
import { PageContainer } from "@/components/shared/page-container";
import { requireCan } from "@/lib/access/require-can";
import { contactPickerOptions } from "@/lib/invoices/contacts";
import { payLinkPossible } from "@/lib/invoices/payments-on";
import { getInvoice } from "@/lib/invoices/service";
import { detailsOnFileOf } from "@/lib/organizations/business-details";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { readOrganizationSettings } from "@/lib/organizations/settings-service";
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
    // Asked before the form is drawn: `invoice:write` is what the API asks of
    // the save (`requireCan`).
    const access = await requireCan("invoice:write", {
        thing: "Edit invoice",
        back: {
            href: `/billing/invoices/${invoiceId}`,
            label: "Back to the invoice",
            needs: "invoice:read",
        },
    });
    if (access.denied) return access.denied;
    const [invoice, contacts, settings, provider, organization] =
        await Promise.all([
            getInvoice(invoiceId),
            contactPickerOptions(),
            // GST standing, and the details Issue needs (#838), in one read.
            readOrganizationSettings(),
            // A payment link needs Payments on too (DEC-070).
            payLinkPossible(),
            resolveActiveOrganization(),
        ]);
    if (!invoice) notFound();
    if (invoice.status !== "DRAFT") redirect(`/billing/invoices/${invoice.id}`);

    return (
        <PageContainer width="full">
            <div>
                <PageHeader
                    className="mb-4"
                    breadcrumb={[
                        "Payments",
                        <Link key="list" href="/billing/invoices">
                            Invoices
                        </Link>,
                        "Draft",
                    ]}
                    title="Edit the draft"
                    description="It has no number yet, so everything on it can still change."
                />
                <InvoiceForm
                    contacts={contacts}
                    defaultCurrency={invoice.currency}
                    draft={invoice}
                    registered={
                        invoice.gst != null ||
                        (settings.ok &&
                            (settings.data.tax?.registered ?? false))
                    }
                    businessName={organization?.name ?? "This business"}
                    providerConnected={provider}
                    detailsOnFile={detailsOnFileOf(settings)}
                />
            </div>
        </PageContainer>
    );
}

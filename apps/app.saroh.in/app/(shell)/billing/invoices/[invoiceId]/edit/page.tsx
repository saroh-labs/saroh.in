import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { InvoiceForm } from "@/components/invoices/invoice-form";
import { PageContainer } from "@/components/shared/page-container";
import { contactPickerOptions } from "@/lib/invoices/contacts";
import { getInvoice } from "@/lib/invoices/service";
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
    const [invoice, contacts] = await Promise.all([
        getInvoice(invoiceId),
        contactPickerOptions(),
    ]);
    if (!invoice) notFound();
    if (invoice.status !== "DRAFT") redirect(`/billing/invoices/${invoice.id}`);

    return (
        <PageContainer width="full">
            <div className="flex flex-col gap-6">
                <PageHeader
                    className="mb-0"
                    breadcrumb={[
                        <Link
                            key="invoices"
                            href="/billing/invoices"
                            className="hover:text-foreground"
                        >
                            Invoices
                        </Link>,
                        "Draft",
                    ]}
                    title="Edit the draft"
                    actions={
                        <Button variant="outline" asChild>
                            <Link href="/billing/invoices">
                                Back to invoices
                            </Link>
                        </Button>
                    }
                />
                <InvoiceForm
                    contacts={contacts}
                    defaultCurrency={invoice.currency}
                    draft={invoice}
                />
            </div>
        </PageContainer>
    );
}

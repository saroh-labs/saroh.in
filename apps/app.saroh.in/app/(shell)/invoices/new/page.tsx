import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { InvoiceForm } from "@/components/invoices/invoice-form";
import { PageContainer } from "@/components/shared/page-container";
import { contactPickerOptions } from "@/lib/invoices/contacts";
import { listInvoices } from "@/lib/invoices/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "New invoice" };

/** Billing → Invoices → New: an invoice for anything that did not bill itself. */
export default async function NewInvoicePage() {
    await requireSession();
    const [contacts, invoices] = await Promise.all([
        contactPickerOptions(),
        listInvoices(),
    ]);

    return (
        <PageContainer width="full">
            <div className="flex flex-col gap-6">
                <PageHeader
                    className="mb-0"
                    breadcrumb={[
                        <Link
                            key="invoices"
                            href="/invoices"
                            className="hover:text-foreground"
                        >
                            Invoices
                        </Link>,
                        "New",
                    ]}
                    title="New invoice"
                    actions={
                        <Button variant="outline" asChild>
                            <Link href="/invoices">Back to invoices</Link>
                        </Button>
                    }
                />
                <InvoiceForm
                    contacts={contacts}
                    // The currency the business last invoiced in.
                    defaultCurrency={invoices.rows.at(0)?.currency ?? "INR"}
                />
            </div>
        </PageContainer>
    );
}

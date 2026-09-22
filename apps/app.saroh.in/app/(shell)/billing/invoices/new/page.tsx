import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { InvoiceForm } from "@/components/invoices/invoice-form";
import { PageContainer } from "@/components/shared/page-container";
import { contactPickerOptions } from "@/lib/invoices/contacts";
import { listInvoices } from "@/lib/invoices/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "New invoice" };

/**
 * Billing → Invoices → New: an invoice for anything that did not bill itself.
 * `?contactId=` — from a contact's page — starts it for that person, when
 * they are among the contacts this person can pick.
 */
export default async function NewInvoicePage({
    searchParams,
}: {
    searchParams: Promise<{ contactId?: string | string[] }>;
}) {
    await requireSession();
    const [contacts, invoices, { contactId }] = await Promise.all([
        contactPickerOptions(),
        listInvoices(),
        searchParams,
    ]);
    const forContact = contacts.find((c) => c.id === contactId);

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
                        "New",
                    ]}
                    title="New invoice"
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
                    // The currency the business last invoiced in.
                    defaultCurrency={invoices.rows.at(0)?.currency ?? "INR"}
                    initialContactId={forContact?.id}
                />
            </div>
        </PageContainer>
    );
}

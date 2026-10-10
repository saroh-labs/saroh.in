import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { InvoiceForm } from "@/components/invoices/invoice-form";
import { PageContainer } from "@/components/shared/page-container";
import { requireCan } from "@/lib/access/require-can";
import { contactPickerOptions } from "@/lib/invoices/contacts";
import { payLinkPossible } from "@/lib/invoices/payments-on";
import { listInvoices } from "@/lib/invoices/service";
import { detailsOnFileOf } from "@/lib/organizations/business-details";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { readOrganizationSettings } from "@/lib/organizations/settings-service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "New invoice" };

/**
 * Payments → Invoices → New, after "Saroh Invoice Detail" (?new=1): an
 * invoice for trade and one-off work. `?contactId=` — from a contact's page
 * — starts it for that person, when they are among the contacts this person
 * can pick.
 */
export default async function NewInvoicePage({
    searchParams,
}: {
    searchParams: Promise<{ contactId?: string | string[] }>;
}) {
    await requireSession();
    // Asked before the form is drawn: `invoice:write` is what the API asks of
    // the save (`requireCan`).
    const access = await requireCan("invoice:write", {
        thing: "New invoice",
        back: {
            href: "/billing/invoices",
            label: "Back to Invoices",
            needs: "invoice:read",
        },
    });
    if (access.denied) return access.denied;
    const [
        contacts,
        invoices,
        settings,
        provider,
        organization,
        { contactId },
    ] = await Promise.all([
        contactPickerOptions(),
        listInvoices(),
        // GST standing, and the details Issue needs (#838), in one read.
        readOrganizationSettings(),
        // A pay link needs Payments on too (DEC-070).
        payLinkPossible(),
        resolveActiveOrganization(),
        searchParams,
    ]);
    const forContact = contacts.find((c) => c.id === contactId);

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
                        "New invoice",
                    ]}
                    title="New invoice"
                    description="For trade and one-off work. Orders and subscriptions make their own."
                />
                <InvoiceForm
                    contacts={contacts}
                    // The currency the business last invoiced in.
                    defaultCurrency={invoices.rows.at(0)?.currency ?? "INR"}
                    initialContactId={forContact?.id}
                    registered={
                        settings.ok && (settings.data.tax?.registered ?? false)
                    }
                    businessName={organization?.name ?? "This business"}
                    providerConnected={provider}
                    detailsOnFile={detailsOnFileOf(settings)}
                />
            </div>
        </PageContainer>
    );
}

import { notFound } from "next/navigation";

import {
    ConnectedPanel,
    HistoryPanel,
} from "@/components/invoices/connected-panel";
import { InvoiceDetail } from "@/components/invoices/invoice-detail";
import { InvoicePaper } from "@/components/invoices/invoice-paper";
import { PaymentsToRefund } from "@/components/invoices/pay-link";
import { PageContainer } from "@/components/shared/page-container";
import { ViewerDate } from "@/components/shared/viewer-date";
import { formatMoneyMajor } from "@/lib/format/money";
import type { Invoice } from "@/lib/invoices/service";
import { getInvoice, listInvoicesFor } from "@/lib/invoices/service";
import {
    billedTo,
    invoicePill,
    paidBy,
    sourceLine,
    whenLine,
} from "@/lib/invoices/status";
import { getInvoiceBusiness } from "@/lib/invoices/tax";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Invoice" };

/**
 * Payments → Invoices → one invoice, after "Saroh Invoice Detail": the tax
 * invoice (a GST-registered business) or receipt as the customer gets it,
 * with the actions its status allows, what it is connected to, how it is
 * being paid and what has happened to it. Print leaves only the paper.
 */
export default async function InvoicePage({
    params,
}: {
    params: Promise<{ invoiceId: string }>;
}) {
    await requireSession();
    const { invoiceId } = await params;
    const [invoice, organization, business] = await Promise.all([
        getInvoice(invoiceId),
        resolveActiveOrganization(),
        getInvoiceBusiness(),
    ]);
    if (!invoice) notFound();

    // The customer's other invoices, for "N more for …". A failure here
    // is said in the panel; it never takes the invoice down with it.
    const others = invoice.contact
        ? await listInvoicesFor(invoice.contact.id).catch(() => null)
        : [];

    const canWrite = organization?.actions
        ? organization.actions.includes("invoice:write")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";
    const businessName = organization?.name ?? "This business";
    const who = billedTo(invoice);
    const money = (a: string) => formatMoneyMajor(a, invoice.currency) ?? a;
    const late = whenLine(invoice);

    return (
        <PageContainer width="full">
            <InvoiceDetail
                invoice={{
                    id: invoice.id,
                    number: invoice.number,
                    standing: invoice.standing,
                    kind: invoice.kind ?? "INVOICE",
                    who: who.name,
                    total: money(invoice.total),
                }}
                pill={invoicePill(invoice)}
                subline={
                    <>
                        {who.name} · {sourceLine(invoice)} ·{" "}
                        {invoice.issuedAt ? (
                            <>
                                issued{" "}
                                <ViewerDate
                                    iso={invoice.issuedAt}
                                    variant="dayMonth"
                                />
                            </>
                        ) : (
                            "not issued yet"
                        )}
                    </>
                }
                canWrite={canWrite}
                registered={
                    invoice.gst != null || (business?.registered ?? false)
                }
                orderHref={
                    invoice.order
                        ? `/commerce/orders/${encodeURIComponent(invoice.order.id)}`
                        : null
                }
                editHref={`/billing/invoices/${encodeURIComponent(invoice.id)}/edit`}
                online={invoice.online ?? null}
                payLine={payLine(invoice, who.name)}
                late={
                    invoice.standing === "OVERDUE" && invoice.dueAt ? (
                        <>
                            {late.before} — due{" "}
                            <ViewerDate
                                iso={invoice.dueAt}
                                variant="dayMonth"
                            />
                            .{" "}
                            {invoice.source === "SUBSCRIPTION"
                                ? "The renewal hasn't been paid. Send the pay link again, or call."
                                : "Send the pay link again, or call."}
                        </>
                    ) : null
                }
                paper={
                    <InvoicePaper
                        invoice={invoice}
                        business={business}
                        businessName={businessName}
                    />
                }
                connected={<ConnectedPanel invoice={invoice} others={others} />}
                after={
                    <>
                        {invoice.online ? (
                            <PaymentsToRefund
                                payments={invoice.online.payments}
                                invoiceStatus={invoice.status}
                            />
                        ) : null}
                        <HistoryPanel invoice={invoice} />
                    </>
                }
            />
        </PageContainer>
    );
}

/** How it stands, in the Payment panel's words. */
function payLine(i: Invoice, who: string) {
    const first = who.split(" ")[0] ?? who;
    if (i.kind === "CREDIT_NOTE") {
        return `A credit note — nothing is owed on it. It cancels ${i.related?.number ?? "an invoice"}.`;
    }
    if (i.order) {
        return i.standing === "CREDITED"
            ? "Refunded on the order. A credit note cancels it."
            : "Paid with the order. Its payments and refunds are made on the order, never here.";
    }
    switch (i.standing) {
        case "PAID":
            return (
                <>
                    Paid{" "}
                    {i.paidAt ? (
                        <ViewerDate iso={i.paidAt} variant="dayMonth" />
                    ) : (
                        "today"
                    )}
                    {i.payment
                        ? ` by ${paidBy(i.payment.method).toLowerCase()}`
                        : ""}
                    .
                </>
            );
        case "CREDITED":
            return "Cancelled by a credit note — nothing is owed.";
        case "VOID":
            return "Voided — nothing is owed.";
        case "DRAFT":
            return "Not issued yet. A draft has no number and can still change.";
        default:
            return i.online?.providerConnected
                ? `Not paid. ${first} can pay by UPI or card from the pay link — copy it and send it, or mark it paid when the money arrives.`
                : `Not paid. Mark it paid when the money arrives.`;
    }
}

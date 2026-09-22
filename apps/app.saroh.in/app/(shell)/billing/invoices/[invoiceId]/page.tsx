import { badgeVariants } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import { Info } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import {
    InvoiceHeaderActions,
    VoidInvoice,
} from "@/components/invoices/invoice-actions";
import { InvoicePaper } from "@/components/invoices/invoice-paper";
import { PayLink, PaymentsToRefund } from "@/components/invoices/pay-link";
import { PageContainer } from "@/components/shared/page-container";
import { ViewerDate } from "@/components/shared/viewer-date";
import { invoiceMoney } from "@/lib/invoices/money";
import type { Invoice, StoredPaymentMethod } from "@/lib/invoices/service";
import { getInvoice } from "@/lib/invoices/service";
import { billedTo, invoiceStatus, sourceLabel } from "@/lib/invoices/status";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Invoice" };

const METHOD: Record<StoredPaymentMethod, string> = {
    ONLINE: "Paid online",
    CASH: "Cash",
    UPI: "UPI",
    BANK_TRANSFER: "Bank transfer",
    CARD: "Card at the counter",
    OTHER: "Another way",
};

/**
 * Billing → Invoices → one invoice, after the "Saroh Billing and Classes"
 * design: the invoice and what can be done with it on the left, and on the
 * right exactly what prints — the same page with the actions stripped.
 *
 * Nothing is emailed, so the screen says so and gives the way out: print it
 * and hand it over, and record the payment when it comes in.
 */
export default async function InvoicePage({
    params,
}: {
    params: Promise<{ invoiceId: string }>;
}) {
    await requireSession();
    const { invoiceId } = await params;
    const [invoice, organization] = await Promise.all([
        getInvoice(invoiceId),
        resolveActiveOrganization(),
    ]);
    if (!invoice) notFound();

    const canWrite = organization?.actions
        ? organization.actions.includes("invoice:write")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";
    const businessName = organization?.name ?? "This business";
    const status = invoiceStatus(invoice);
    const who = billedTo(invoice);
    const money = (a: string) => invoiceMoney(a, invoice.currency);
    const open =
        invoice.standing === "ISSUED" || invoice.standing === "OVERDUE";
    const title = invoice.number ?? "Draft invoice";

    return (
        <PageContainer width="full">
            <div className="flex flex-col gap-6">
                <PageHeader
                    className="mb-0 print:hidden"
                    breadcrumb={[
                        <Link
                            key="invoices"
                            href="/billing/invoices"
                            className="hover:text-foreground"
                        >
                            Invoices
                        </Link>,
                        title,
                    ]}
                    title={
                        <span
                            className={
                                invoice.number
                                    ? "font-mono tracking-normal"
                                    : undefined
                            }
                        >
                            {title}
                        </span>
                    }
                    actions={
                        <Button variant="outline" asChild>
                            <Link href="/billing/invoices">
                                Back to invoices
                            </Link>
                        </Button>
                    }
                />

                <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] print:block">
                    <div className="flex min-w-0 flex-col gap-4 print:hidden">
                        <section className="overflow-hidden rounded-[12px] border border-border bg-card">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-3 border-b border-border bg-muted/40 px-4 py-3.5">
                                <span
                                    className={badgeVariants({
                                        variant: status.variant,
                                    })}
                                >
                                    {chipLabel(status)}
                                </span>
                                <span className="text-[13px] text-muted-foreground">
                                    {when(invoice)}
                                </span>
                                <div className="ml-auto">
                                    <InvoiceHeaderActions
                                        canWrite={canWrite}
                                        invoice={{
                                            id: invoice.id,
                                            number: invoice.number,
                                            standing: invoice.standing,
                                            who: who.name,
                                            total: money(invoice.total),
                                        }}
                                    />
                                </div>
                            </div>

                            <dl className="grid gap-4 px-4 py-4 sm:grid-cols-3">
                                <Fact label="Billed to">
                                    {who.contactId ? (
                                        <Link
                                            href={`/contacts/${who.contactId}`}
                                            className="underline-offset-4 hover:underline"
                                        >
                                            {who.name}
                                        </Link>
                                    ) : (
                                        <span>
                                            {who.name}
                                            {invoice.status !== "DRAFT" ? (
                                                <span className="text-muted-foreground">
                                                    {" "}
                                                    (removed)
                                                </span>
                                            ) : null}
                                        </span>
                                    )}
                                    {who.email ? (
                                        <span className="block truncate text-[12.5px] text-muted-foreground">
                                            {who.email}
                                        </span>
                                    ) : null}
                                </Fact>
                                <Fact label="For">
                                    {sourceLabel(invoice.source)}
                                    {invoice.periodStart &&
                                    invoice.periodEnd ? (
                                        <span className="block text-[12.5px] text-muted-foreground">
                                            <ViewerDate
                                                iso={invoice.periodStart}
                                            />{" "}
                                            –{" "}
                                            <PeriodEnd
                                                iso={invoice.periodEnd}
                                            />
                                        </span>
                                    ) : null}
                                </Fact>
                                <Fact label="Number">
                                    <span className="font-mono">
                                        {invoice.number ?? "None yet"}
                                    </span>
                                    <span className="block text-[12.5px] text-muted-foreground">
                                        Assigned when issued
                                    </span>
                                </Fact>
                            </dl>

                            <div className="mx-4 mb-4 overflow-x-auto rounded-[10px] border border-border">
                                <table className="w-full min-w-[420px] text-[13px]">
                                    <thead>
                                        <tr className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                                            <th className="px-3.5 py-2.5 text-left font-semibold">
                                                Line
                                            </th>
                                            <th className="px-3.5 py-2.5 text-right font-semibold">
                                                Qty
                                            </th>
                                            <th className="px-3.5 py-2.5 text-right font-semibold">
                                                Each
                                            </th>
                                            <th className="px-3.5 py-2.5 text-right font-semibold">
                                                Amount
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(invoice.lines ?? []).map((l) => (
                                            <tr
                                                key={l.id}
                                                className="border-b border-border"
                                            >
                                                <td className="px-3.5 py-3">
                                                    {l.description}
                                                </td>
                                                <td className="px-3.5 py-3 text-right tabular-nums">
                                                    {l.quantity}
                                                </td>
                                                <td className="px-3.5 py-3 text-right tabular-nums">
                                                    {money(l.unitPrice)}
                                                </td>
                                                <td className="px-3.5 py-3 text-right tabular-nums">
                                                    {money(l.amount)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <td
                                                colSpan={3}
                                                className="px-3.5 pt-3 text-right text-muted-foreground"
                                            >
                                                Tax
                                            </td>
                                            <td className="px-3.5 pt-3 text-right tabular-nums">
                                                {Number(invoice.tax) > 0
                                                    ? money(invoice.tax)
                                                    : "None"}
                                            </td>
                                        </tr>
                                        <tr>
                                            <th
                                                colSpan={3}
                                                className="px-3.5 pb-3 pt-2 text-right font-display text-[15px] font-semibold"
                                            >
                                                Total
                                            </th>
                                            <td className="px-3.5 pb-3 pt-2 text-right font-display text-[17px] font-semibold tabular-nums">
                                                {money(invoice.total)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </section>

                        <StatusNote invoice={invoice} />

                        {invoice.online ? (
                            <PaymentsToRefund
                                payments={invoice.online.payments}
                                invoiceStatus={invoice.status}
                            />
                        ) : null}

                        {open && invoice.online ? (
                            <PayLink
                                invoiceId={invoice.id}
                                who={who.name}
                                total={money(invoice.total)}
                                providerConnected={
                                    invoice.online.providerConnected
                                }
                                payLinkActive={invoice.online.payLinkActive}
                                canWrite={canWrite}
                            />
                        ) : null}

                        {canWrite && open ? (
                            <VoidInvoice
                                invoice={{
                                    id: invoice.id,
                                    number: invoice.number,
                                    standing: invoice.standing,
                                    who: who.name,
                                    total: money(invoice.total),
                                }}
                            />
                        ) : null}
                    </div>

                    <div className="flex min-w-0 flex-col gap-2">
                        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground print:hidden">
                            What prints
                        </h2>
                        <InvoicePaper
                            invoice={invoice}
                            businessName={businessName}
                        />
                        <p className="text-[12px] text-muted-foreground print:hidden">
                            One page, no rail, no buttons — Print gives exactly
                            this.
                        </p>
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="min-w-0">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {label}
            </dt>
            <dd className="mt-1 text-[13.5px]">{children}</dd>
        </div>
    );
}

/** A period's last day: the end is the instant the next period starts. */
function PeriodEnd({ iso }: { iso: string }) {
    return <ViewerDate iso={new Date(Date.parse(iso) - 1).toISOString()} />;
}

/**
 * The status chip, with what makes it urgent: "Overdue · 16 days", "Issued ·
 * due tomorrow". The dates themselves sit beside it.
 */
function chipLabel(status: { label: string; detail: string | null }): string {
    if (!status.detail) return status.label;
    const detail =
        status.label === "Overdue"
            ? status.detail.replace(" overdue", "")
            : status.detail.charAt(0).toLowerCase() + status.detail.slice(1);
    return `${status.label} · ${detail}`;
}

/** The dates line beside the status chip. */
function when(invoice: Invoice): ReactNode {
    if (invoice.status === "DRAFT") {
        return "Not issued yet — it has no number until it is.";
    }
    if (invoice.status === "PAID" && invoice.paidAt) {
        return (
            <>
                Paid <ViewerDate iso={invoice.paidAt} />
                {invoice.payment
                    ? ` · ${METHOD[invoice.payment.method]}${invoice.payment.reference ? ` · ${invoice.payment.reference}` : ""}`
                    : ""}
            </>
        );
    }
    if (invoice.status === "VOID" && invoice.voidedAt) {
        return (
            <>
                Voided <ViewerDate iso={invoice.voidedAt} />
            </>
        );
    }
    return (
        <>
            {invoice.issuedAt ? (
                <>
                    Issued <ViewerDate iso={invoice.issuedAt} />
                </>
            ) : null}
            {invoice.dueAt ? (
                <>
                    {" · due "}
                    <ViewerDate iso={invoice.dueAt} />
                </>
            ) : null}
        </>
    );
}

/** The note under the invoice: what Saroh does and does not do with it. */
function StatusNote({ invoice }: { invoice: Invoice }) {
    let text: ReactNode;
    if (invoice.status === "DRAFT") {
        text =
            "A draft can be changed or deleted freely. Issuing gives it the next number and locks its lines.";
    } else if (invoice.status === "VOID") {
        text = (
            <>
                Voided{invoice.voidReason ? `: ${invoice.voidReason}` : ""}. It
                keeps its number and is not to be paid.
                {invoice.reissuedAsId ? (
                    <>
                        {" "}
                        <Link
                            href={`/billing/invoices/${invoice.reissuedAsId}`}
                            className="font-medium text-foreground underline underline-offset-4"
                        >
                            Open the invoice that replaced it
                        </Link>
                        .
                    </>
                ) : null}
            </>
        );
    } else if (invoice.payment?.method === "ONLINE") {
        text = `${invoice.payment.note ?? "Paid online"} with the invoice's pay link. Saroh recorded it when the payment was confirmed.`;
    } else if (invoice.status === "PAID") {
        text = invoice.payment?.note
            ? `Recorded by hand: ${invoice.payment.note}`
            : "Recorded by hand. Nothing was charged through Saroh.";
    } else if (invoice.issuedAutomatically) {
        text = (
            <>
                Issued automatically · not sent. Saroh made this at the
                subscription&apos;s renewal and doesn&apos;t send it. Print it
                and hand it over. Payment taken at the counter goes on with{" "}
                <strong className="text-foreground">Record a payment</strong>.
            </>
        );
    } else {
        text = (
            <>
                Saroh doesn&apos;t send this. Print it and hand it over. Payment
                taken at the counter goes on with{" "}
                <strong className="text-foreground">Record a payment</strong>.
            </>
        );
    }
    return (
        <div className="flex items-start gap-3 rounded-[12px] border border-border bg-muted/40 px-4 py-3.5 text-[13px] leading-[1.55] text-muted-foreground print:hidden">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            <p className="text-pretty">
                {invoice.reissuedFromId && invoice.status === "DRAFT" ? (
                    <>
                        This draft replaces a voided invoice.{" "}
                        <Link
                            href={`/billing/invoices/${invoice.reissuedFromId}`}
                            className="font-medium text-foreground underline underline-offset-4"
                        >
                            Open the voided one
                        </Link>
                        .{" "}
                    </>
                ) : null}
                {text}
            </p>
        </div>
    );
}

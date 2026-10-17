import { Badge } from "@saroh/ui/badge";

import {
    refundSourceLabel,
    refundStatusLabel,
} from "@/lib/billing-action-words";
import type {
    SarohInvoiceRow,
    SarohRefundRow,
    SarohSubscriptionDetail,
} from "@/lib/billing-words";
import {
    formatPaise,
    invoicePdfHref,
    istDate,
    istDateTime,
} from "@/lib/billing-words";

import { ActionList } from "./action-list";
import { RecheckRefund, RecordRefund, SyncCustomer } from "./billing-controls";
import { RazorpayId } from "./razorpay-id";

/**
 * What a subscription sheet shows of the business's billing beyond its
 * plan (DEC-166), so the Billing role acts from here without opening the
 * business: its Razorpay customer, what needs action, double charges, its
 * last invoices with their refunds, and every refund and dispute.
 */
export function SubscriptionBilling({
    detail,
    canAct,
}: {
    detail: SarohSubscriptionDetail;
    canAct: boolean;
}) {
    const orgId = detail.subscription.organization.id;
    return (
        <>
            {detail.openActions.length > 0 ? (
                <Section title="Needs action">
                    <ActionList
                        items={detail.openActions}
                        canAct={canAct}
                        showBusiness={false}
                    />
                </Section>
            ) : null}

            <Section title="Razorpay customer">
                <CustomerFacts customer={detail.billingCustomer} />
                {canAct ? <SyncCustomer organizationId={orgId} /> : null}
            </Section>

            {detail.doubleCharges.length > 0 ? (
                <Section title="Double charges">
                    <ul className="grid gap-2">
                        {detail.doubleCharges.map((d) => (
                            <li
                                key={d.providerPaymentId}
                                className="grid gap-1 rounded-lg border p-3"
                            >
                                <RazorpayId
                                    id={d.providerPaymentId}
                                    provider={d.provider || "RAZORPAY"}
                                />
                                <p className="text-muted-foreground">
                                    {d.amountPaise !== null
                                        ? `${formatPaise(d.amountPaise)} · `
                                        : ""}
                                    {d.reason ?? "Charged twice"} · found{" "}
                                    {istDate(d.claimedAt)}
                                </p>
                                {d.refundedAt ? (
                                    <p>
                                        Refunded {istDate(d.refundedAt)}{" "}
                                        <RazorpayId
                                            id={d.providerRefundId}
                                            provider={d.provider || "RAZORPAY"}
                                        />
                                    </p>
                                ) : (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p>Refund owed</p>
                                        {canAct ? (
                                            <RecheckRefund
                                                providerPaymentId={
                                                    d.providerPaymentId
                                                }
                                            />
                                        ) : null}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                </Section>
            ) : null}

            <Section title="Invoices">
                {detail.invoices.length === 0 ? (
                    <p className="text-muted-foreground">No invoice yet.</p>
                ) : (
                    <ul className="grid gap-2">
                        {detail.invoices.map((invoice) => (
                            <InvoiceItem
                                key={invoice.id}
                                invoice={invoice}
                                canAct={canAct}
                            />
                        ))}
                    </ul>
                )}
            </Section>

            <Section title="Refunds and disputes">
                {detail.refunds.length === 0 ? (
                    <p className="text-muted-foreground">
                        None recorded for this business.
                    </p>
                ) : (
                    <ul className="grid gap-1.5">
                        {detail.refunds.map((r) => (
                            <RefundLine key={r.id} refund={r} />
                        ))}
                    </ul>
                )}
            </Section>
        </>
    );
}

function Section({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section className="grid gap-2">
            <h3 className="font-medium">{title}</h3>
            {children}
        </section>
    );
}

function CustomerFacts({
    customer,
}: {
    customer: SarohSubscriptionDetail["billingCustomer"];
}) {
    if (!customer) {
        return (
            <p className="text-muted-foreground">
                Not made yet: Saroh makes it at sign-up, or with the first
                checkout.
            </p>
        );
    }
    return (
        <div className="grid gap-1">
            {customer.providerCustomerId ? (
                <RazorpayId
                    id={customer.providerCustomerId}
                    provider={customer.provider}
                />
            ) : (
                <p className="text-muted-foreground">
                    No customer id yet at {customer.provider}.
                </p>
            )}
            <p className="text-muted-foreground">
                {customer.syncedAt
                    ? `Last synced ${istDateTime(customer.syncedAt)}`
                    : "Never synced"}
                {customer.contactWithheld
                    ? " · made without the phone (another business of the same owner has it)"
                    : ""}
            </p>
            {customer.lastError ? (
                <p className="text-destructive">
                    Last sync failed: {customer.lastError}
                </p>
            ) : null}
        </div>
    );
}

function InvoiceItem({
    invoice,
    canAct,
}: {
    invoice: SarohInvoiceRow;
    canAct: boolean;
}) {
    return (
        <li className="grid gap-1 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <a
                    href={invoicePdfHref(invoice.id)}
                    className="font-mono text-[13px] font-medium underline underline-offset-4"
                    aria-label={`Download invoice ${invoice.number} as a PDF`}
                >
                    {invoice.number}
                </a>
                <span className="tabular-nums">
                    {formatPaise(invoice.totalPaise, invoice.currency)}
                </span>
            </div>
            <p className="text-muted-foreground">
                {istDate(invoice.issuedAt)} · {invoice.planName}
            </p>
            {invoice.amountMismatch && invoice.providerAmountPaise !== null ? (
                <div>
                    <Badge variant="warning">
                        Razorpay took{" "}
                        {formatPaise(
                            invoice.providerAmountPaise,
                            invoice.currency,
                        )}
                    </Badge>
                </div>
            ) : null}
            {invoice.providerPaymentId ? (
                <RazorpayId
                    id={invoice.providerPaymentId}
                    provider={invoice.provider}
                />
            ) : (
                <p className="text-muted-foreground">No payment id</p>
            )}
            {invoice.refunds.length > 0 ? (
                <ul className="grid gap-1">
                    {invoice.refunds.map((r) => (
                        <RefundLine key={r.id} refund={r} />
                    ))}
                </ul>
            ) : null}
            {canAct ? (
                <RecordRefund
                    invoiceId={invoice.id}
                    invoiceNumber={invoice.number}
                    providerPaymentId={invoice.providerPaymentId}
                    totalPaise={invoice.totalPaise}
                />
            ) : null}
        </li>
    );
}

function RefundLine({ refund }: { refund: SarohRefundRow }) {
    return (
        <li className="grid gap-0.5 border-b pb-1.5 text-sm last:border-b-0">
            <p>
                {refundStatusLabel(refund.status)}
                {refund.amountPaise !== null
                    ? ` · ${formatPaise(refund.amountPaise)}`
                    : ""}{" "}
                · {refundSourceLabel(refund.source)} ·{" "}
                {istDate(refund.createdAt)}
            </p>
            <p className="flex flex-wrap gap-x-3">
                <RazorpayId
                    id={refund.providerRefundId}
                    provider={refund.provider}
                />
                <RazorpayId
                    id={refund.providerPaymentId}
                    provider={refund.provider}
                />
            </p>
            {refund.reason ? (
                <p className="text-muted-foreground">{refund.reason}</p>
            ) : null}
        </li>
    );
}

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
import { formatPaise, invoicePdfHref, istDate } from "@/lib/billing-words";

import { RecordRefund } from "./billing-controls";
import { RazorpayId } from "./razorpay-id";

/**
 * The subscription sheet's Invoices tab (U15, R27): the business's last
 * invoices, each with its PDF, the provider's payment and its refunds,
 * and, for operators with `saroh-billing:act`, Record a refund made by
 * hand; then every refund and dispute, and double charges found. The
 * billing profile and today's other actions are on Summary.
 */
export function SubscriptionInvoices({
    detail,
    canAct,
    onDone,
}: {
    detail: SarohSubscriptionDetail;
    canAct: boolean;
    /** A write went through: the sheet says so and lights the row. */
    onDone?: (message: string) => void;
}) {
    return (
        <div className="grid gap-6">
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
                                onDone={onDone}
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
                                    <p>Refund owed: re-check it on Summary.</p>
                                )}
                            </li>
                        ))}
                    </ul>
                </Section>
            ) : null}
        </div>
    );
}

export function Section({
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

function InvoiceItem({
    invoice,
    canAct,
    onDone,
}: {
    invoice: SarohInvoiceRow;
    canAct: boolean;
    onDone?: (message: string) => void;
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
                    onDone={() =>
                        onDone?.(`Refund recorded on ${invoice.number}.`)
                    }
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

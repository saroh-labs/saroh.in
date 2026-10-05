"use client";

import { ctaClasses, destructiveAlertClasses } from "@saroh/site-blocks";
import { cn } from "@saroh/ui/lib/utils";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { startPayment } from "@/app/pay/[token]/actions";
import {
    DownloadPdfButton,
    InvoiceCopyActions,
} from "@/components/download-pdf-button";
import { InvoiceAutopay } from "@/components/invoice-autopay";
import { PrintButton } from "@/components/print-button";
import { ProviderHandoff } from "@/components/provider-handoff";
import type { CheckoutIntent } from "@/lib/checkout-shape";
import type { PayInvoice } from "@/lib/invoice-pay";
import { payDate, payMoney, payOffer, payTitle } from "@/lib/invoice-pay-shape";
import { hasCustomerPdf } from "@/lib/invoice-pdf";

/**
 * The invoice a pay link shows, and its Pay button (ADR-007, U13).
 *
 * Only what the API's allow-list sends is on the page: the business, the
 * number, the dates, the lines, tax and total, and who it is billed to. The
 * Pay button starts an intent for the invoice's own total and hands over to
 * the provider exactly as order checkout does; the page never claims a
 * payment went through — "Check again" re-reads the invoice, which only the
 * provider's webhook moves to paid.
 *
 * A plan's invoice, where the business's provider takes autopay, offers
 * "Pay and turn on autopay" first (D12, `invoice-autopay.tsx`).
 *
 * A business that doesn't take payment online (`payOnline` false, DEC-070)
 * sends the same link to view the invoice: no Pay button, its PDF to
 * download or a copy to print, and "Pay ‹business› the way they've asked
 * you to".
 *
 * Wherever the page has a `pdfHref`, the customer can download the invoice
 * as the business issued it (DEC-083): beside Print where the page offers
 * a copy, and as a quieter line under the pay page's other actions. A void
 * invoice has none.
 *
 * Styled in the business's `--site-*` tokens, never Saroh's brand. Status is
 * an opaque fill with its own foreground, for the reason checkout gives: the
 * page ground is the merchant's, so a tint cannot be trusted against it.
 */
export function InvoicePay({
    token,
    invoice,
    apiUrl,
    pdfHref,
}: {
    token: string;
    invoice: PayInvoice;
    /** Where an autopay window's return is posted (P1). */
    apiUrl?: string;
    /** This app's route for the invoice's PDF (DEC-083); absent, none. */
    pdfHref?: string;
}) {
    const router = useRouter();
    const [intent, setIntent] = useState<CheckoutIntent | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    // One key per visit, so a double tap can't start two payments.
    const [idempotencyKey] = useState(() =>
        typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2),
    );

    const money = (a: string) => payMoney(a, invoice.currency);
    const issued = payDate(invoice.issuedAt);
    const due = payDate(invoice.dueAt);
    // While autopay is charging it (D13) there is nothing to pay here: the
    // customer would be charged twice.
    const charging = invoice.autopayCharging ?? null;
    // When autopay next takes money (D13B): this invoice's queued charge,
    // or once it's paid, the next renewal's.
    const nextCharge = invoice.autopayNextCharge ?? null;
    // Pay, or — where the business doesn't take payment online (DEC-070)
    // — the invoice to keep, and pay them their own way.
    const offer = payOffer(invoice);
    const payable = offer === "pay";
    // The PDF, wherever there is one to hand out (DEC-083).
    const pdf = pdfHref && hasCustomerPdf(invoice.status) ? pdfHref : null;
    // Autopay for the invoice's plan (D12): offered, or on already.
    const autopay =
        invoice.autopay &&
        (invoice.autopay.on || invoice.autopay.methods.length > 0)
            ? invoice.autopay
            : null;

    function pay() {
        setError(null);
        startTransition(async () => {
            const res = await startPayment(token, idempotencyKey);
            if (res.ok) {
                setIntent(res.intent);
                return;
            }
            setError(res.message);
            if (res.settled) router.refresh();
        });
    }

    return (
        <section className="mx-auto w-full max-w-xl px-5 py-12 sm:px-8 sm:py-16">
            <p className="text-sm text-site-muted">{invoice.businessName}</p>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-site-fg">
                    {payTitle(invoice)} {invoice.number}
                </h1>
                <StatusBadge status={invoice.status} />
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                {invoice.billedTo ? (
                    <Fact label="Billed to" value={invoice.billedTo} />
                ) : null}
                {issued ? <Fact label="Issued" value={issued} /> : null}
                {due ? <Fact label="Due" value={due} /> : null}
            </dl>

            <div className="mt-8 overflow-x-auto rounded-xl border border-site-border">
                <table className="w-full min-w-[320px] text-sm">
                    <thead>
                        <tr className="border-b border-site-border text-left text-xs text-site-muted">
                            <th className="px-4 py-2.5 font-medium">Item</th>
                            <th className="px-4 py-2.5 text-right font-medium">
                                Qty
                            </th>
                            <th className="px-4 py-2.5 text-right font-medium">
                                Amount
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {invoice.lines.map((l, i) => (
                            <tr
                                key={`${i}-${l.description}`}
                                className="border-b border-site-border text-site-body"
                            >
                                <td className="px-4 py-3">
                                    {l.description}
                                    {l.quantity > 1 ? (
                                        <span className="block text-xs text-site-muted">
                                            {money(l.unitPrice)} each
                                        </span>
                                    ) : null}
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums">
                                    {l.quantity}
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums">
                                    {money(l.amount)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        {Number(invoice.tax) > 0 ? (
                            <tr>
                                <td
                                    colSpan={2}
                                    className="px-4 pt-3 text-right text-site-muted"
                                >
                                    Tax
                                </td>
                                <td className="px-4 pt-3 text-right tabular-nums">
                                    {money(invoice.tax)}
                                </td>
                            </tr>
                        ) : null}
                        <tr className="text-base font-semibold text-site-fg">
                            <td
                                colSpan={2}
                                className="px-4 pb-3 pt-2 text-right"
                            >
                                Total
                            </td>
                            <td className="px-4 pb-3 pt-2 text-right tabular-nums">
                                {money(invoice.total)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            {invoice.billOfSupply ? (
                <p className="mt-2 text-xs text-site-muted">
                    Supply exempt from GST.
                </p>
            ) : null}

            {payable ? (
                <div className="mt-6 space-y-4">
                    {error ? (
                        <p role="alert" className={destructiveAlertClasses}>
                            {error}
                        </p>
                    ) : null}
                    {intent ? (
                        <ProviderHandoff
                            intent={intent}
                            after="Once you've paid, use “Check again” to see this invoice marked paid."
                        />
                    ) : autopay ? (
                        // A plan's invoice with autopay offered (D12).
                        <InvoiceAutopay
                            token={token}
                            autopay={autopay}
                            businessName={invoice.businessName}
                            billedTo={invoice.billedTo}
                            total={money(invoice.total)}
                            payable
                            onJustPay={pay}
                            justPayBusy={pending}
                            apiUrl={apiUrl}
                        />
                    ) : (
                        <button
                            type="button"
                            onClick={pay}
                            disabled={pending}
                            className={cn(
                                ctaClasses("primary"),
                                "w-full disabled:cursor-not-allowed disabled:opacity-60",
                            )}
                        >
                            {pending
                                ? "Starting payment…"
                                : `Pay ${money(invoice.total)}`}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => router.refresh()}
                        className={cn(ctaClasses("secondary"), "w-full")}
                    >
                        Check again
                    </button>
                </div>
            ) : offer === "elsewhere" ? (
                <div className="mt-6 space-y-4">
                    <div
                        role="status"
                        className="rounded-xl border border-site-border bg-site-surface p-5 text-center"
                    >
                        <p className="font-semibold text-site-fg">
                            Pay {invoice.businessName} the way they&apos;ve
                            asked you to.
                        </p>
                        <p className="mt-1 text-sm text-site-muted">
                            {invoice.businessName} doesn&apos;t take payment
                            online. Keep a copy of this invoice for your
                            records.
                        </p>
                    </div>
                    {pdf ? (
                        <InvoiceCopyActions
                            pdfHref={pdf}
                            number={invoice.number}
                        />
                    ) : (
                        <PrintButton />
                    )}
                </div>
            ) : charging ? (
                <div className="mt-6 space-y-4">
                    <div
                        role="status"
                        className="rounded-xl border border-site-border bg-site-surface p-5 text-center"
                    >
                        <p className="font-semibold text-site-fg">
                            {nextCharge
                                ? `Next autopay charge: ${payDate(nextCharge.at)}`
                                : `Autopay charge in progress · ${payDate(charging.at)}`}
                        </p>
                        <p className="mt-1 text-sm text-site-muted">
                            Your autopay is paying this invoice. Your bank lets
                            you know before it takes the money, so there&apos;s
                            nothing to pay here.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => router.refresh()}
                        className={cn(ctaClasses("secondary"), "w-full")}
                    >
                        Check again
                    </button>
                </div>
            ) : (
                <div className="mt-6 space-y-4">
                    <div className="rounded-xl border border-site-border bg-site-surface p-5 text-center">
                        <p className="text-site-fg">
                            {invoice.status === "PAID"
                                ? `This invoice is paid. Thank you — there's nothing more to do.`
                                : `This invoice is no longer payable. If you think that's a mistake, ask ${invoice.businessName}.`}
                        </p>
                        {invoice.status === "PAID" && nextCharge ? (
                            <p className="mt-1 text-sm text-site-muted">
                                Next autopay charge: {payDate(nextCharge.at)}
                            </p>
                        ) : null}
                    </div>
                    {invoice.status === "PAID" && autopay ? (
                        // Paid, and the plan can still turn autopay on (D12).
                        <InvoiceAutopay
                            token={token}
                            autopay={autopay}
                            businessName={invoice.businessName}
                            billedTo={invoice.billedTo}
                            total={money(invoice.total)}
                            payable={false}
                            onJustPay={pay}
                            justPayBusy={pending}
                            apiUrl={apiUrl}
                        />
                    ) : null}
                </div>
            )}
            {pdf && offer !== "elsewhere" ? (
                // Paying, paid or held for autopay: the invoice to keep,
                // under the page's own actions.
                <div className="mt-4">
                    <DownloadPdfButton
                        href={pdf}
                        number={invoice.number}
                        variant="link"
                    />
                </div>
            ) : null}
        </section>
    );
}

function Fact({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0">
            <dt className="text-xs text-site-muted">{label}</dt>
            <dd className="truncate text-site-fg">{value}</dd>
        </div>
    );
}

const STATUS: Record<PayInvoice["status"], { label: string; cls: string }> = {
    ISSUED: { label: "Due", cls: "bg-site-surface text-site-body" },
    OVERDUE: {
        label: "Overdue",
        cls: "bg-warning text-warning-foreground",
    },
    PAID: { label: "Paid", cls: "bg-success text-success-foreground" },
    VOID: {
        label: "No longer payable",
        cls: "bg-site-surface text-site-muted",
    },
};

function StatusBadge({ status }: { status: PayInvoice["status"] }) {
    const s = STATUS[status];
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                s.cls,
            )}
        >
            {s.label}
        </span>
    );
}

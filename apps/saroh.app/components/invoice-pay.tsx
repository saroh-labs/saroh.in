"use client";

import { ctaClasses, destructiveAlertClasses } from "@saroh/site-blocks";
import { cn } from "@saroh/ui/lib/utils";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { startPayment } from "@/app/pay/[token]/actions";
import { ProviderHandoff } from "@/components/provider-handoff";
import type { CheckoutIntent } from "@/lib/checkout-shape";
import type { PayInvoice } from "@/lib/invoice-pay";
import { payDate, payMoney } from "@/lib/invoice-pay-shape";

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
 * Styled in the business's `--site-*` tokens, never Saroh's brand. Status is
 * an opaque fill with its own foreground, for the reason checkout gives: the
 * page ground is the merchant's, so a tint cannot be trusted against it.
 */
export function InvoicePay({
    token,
    invoice,
}: {
    token: string;
    invoice: PayInvoice;
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
    const payable = invoice.status === "ISSUED" || invoice.status === "OVERDUE";

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
                    Invoice {invoice.number}
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
            ) : (
                <div className="mt-6 rounded-xl border border-site-border bg-site-surface p-5 text-center">
                    <p className="text-site-fg">
                        {invoice.status === "PAID"
                            ? `This invoice is paid. Thank you — there's nothing more to do.`
                            : `This invoice is no longer payable. If you think that's a mistake, ask ${invoice.businessName}.`}
                    </p>
                </div>
            )}
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

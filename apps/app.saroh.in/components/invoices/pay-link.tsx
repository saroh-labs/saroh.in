"use client";

import { AlertTriangle } from "lucide-react";

import { ViewerDate } from "@/components/shared/viewer-date";
import { invoiceMoney } from "@/lib/invoices/money";
import type { InvoiceOnlinePayment } from "@/lib/invoices/service";

/** What a provider is called where a merchant reads it. */
const PROVIDER: Record<string, string> = {
    RAZORPAY: "Razorpay",
    CASHFREE: "Cashfree",
};

export function providerName(provider: string): string {
    return PROVIDER[provider] ?? provider;
}

/**
 * Money taken through the pay link that the invoice could not take: it
 * arrived after the invoice was already paid or voided. The customer is owed
 * it back, and Saroh cannot send it — the refund is made in the provider's
 * own dashboard, and Saroh records it when the provider reports it.
 */
export function PaymentsToRefund({
    payments,
    invoiceStatus,
}: {
    payments: InvoiceOnlinePayment[];
    invoiceStatus: string;
}) {
    const owed = payments.filter((p) => !p.applied);
    if (owed.length === 0) return null;
    const after =
        invoiceStatus === "VOID"
            ? "after this invoice was voided"
            : "after this invoice was already paid";
    return (
        <div className="flex flex-col gap-2 print:hidden">
            {owed.map((p) => {
                const name = providerName(p.provider);
                const amount = invoiceMoney(p.amount, p.currency);
                return (
                    <div
                        key={p.id}
                        role={p.refund === "REFUNDED" ? undefined : "alert"}
                        className={
                            p.refund === "REFUNDED"
                                ? "rounded-[12px] border border-border bg-muted/40 px-4 py-3.5 text-[13px] leading-[1.55] text-muted-foreground"
                                : "flex items-start gap-3 rounded-[12px] bg-warning-subtle px-4 py-3.5 text-[13px] leading-[1.55] text-warning-subtle-foreground"
                        }
                    >
                        {p.refund === "REFUNDED" ? null : (
                            <AlertTriangle
                                aria-hidden
                                className="mt-0.5 size-4 shrink-0"
                            />
                        )}
                        <p className="text-pretty">
                            {amount} came in through {name} on{" "}
                            <ViewerDate iso={p.at} />, {after}.{" "}
                            {p.refund === "REFUNDED"
                                ? `It has been refunded.`
                                : p.refund === "PENDING"
                                  ? `A refund is on its way; ${name} will confirm it.`
                                  : `It wasn't applied to the invoice and is owed back. Refund it from your ${name} dashboard — Saroh records the refund when ${name} reports it.`}
                        </p>
                    </div>
                );
            })}
        </div>
    );
}

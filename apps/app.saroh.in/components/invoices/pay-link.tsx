"use client";

import { ViewerDate } from "@/components/shared/dates/viewer-date";
import { formatMoneyMajor } from "@/lib/format/money";
import type { InvoiceOnlinePayment } from "@/lib/invoices/service";
import { Notice } from "@saroh/ui/notice";

/** What a provider is called where a merchant reads it. */
const PROVIDER: Record<string, string> = {
    RAZORPAY: "Razorpay",
    CASHFREE: "Cashfree",
};

export function providerName(provider: string): string {
    return PROVIDER[provider] ?? provider;
}

/**
 * Money taken through the payment link that the invoice could not take: it
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
                const amount = formatMoneyMajor(p.amount, p.currency, {
                    decimals: "always",
                });
                return (
                    <Notice
                        key={p.id}
                        tone={p.refund === "REFUNDED" ? "neutral" : "warning"}
                        role={p.refund === "REFUNDED" ? "note" : "alert"}
                        icon={p.refund === "REFUNDED" ? false : undefined}
                    >
                        <p className="text-pretty">
                            {amount} came in through {name} on{" "}
                            <ViewerDate iso={p.at} />, {after}.{" "}
                            {p.refund === "REFUNDED"
                                ? `It has been refunded.`
                                : p.refund === "PENDING"
                                  ? `A refund is on its way. ${name} will confirm it.`
                                  : `It wasn't applied to the invoice and is owed back. Refund it from your ${name} dashboard. Saroh records the refund when ${name} reports it.`}
                        </p>
                    </Notice>
                );
            })}
        </div>
    );
}

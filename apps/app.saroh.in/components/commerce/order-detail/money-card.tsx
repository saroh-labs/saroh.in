import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { OrderPayments } from "@/components/stores/order-payments";
import type { OrderRead, OrderReadMoney } from "@/lib/orders/read";
import { providerName } from "@/lib/payments/providers";
import type { OrderPaymentsSummary } from "@/lib/payments/service";

import { actionClass, FOCUS, Panel, PanelTitle } from "./parts";

const KIND_LABEL: Record<string, string> = {
    CREDIT_NOTE: "Credit note",
    SUPPLEMENTARY: "Supplementary invoice",
};

/**
 * The money column — only for a role with a money read; the API sends none
 * to anyone else, so a Member's page has no figure on it anywhere.
 *
 * What it came to, what was handed back, the order's own invoice and its
 * corrections (ADR-008: the order is the ledger, the invoice mirrors it),
 * then how it was paid and where the money lands. Saroh records no provider
 * fees or payout dates, so the design's Fee and "You get" rows are left out
 * rather than guessed; every attempt and refund stays one tap away.
 */
export function MoneyCard({
    money,
    fulfilment,
    paymentStatus,
    refundStanding,
    invoices,
    payments,
    format,
    onRetryRefund,
    busy = false,
}: {
    money: OrderReadMoney;
    fulfilment: OrderRead["fulfilment"];
    paymentStatus: OrderRead["paymentStatus"];
    refundStanding: OrderRead["refundStanding"];
    invoices: OrderRead["invoices"];
    payments: OrderPaymentsSummary | null;
    format: (amount: number) => string;
    /** Try again a refund being confirmed — `payment:manage` only. */
    onRetryRefund?: (refundId: string) => void;
    busy?: boolean;
}) {
    const n = (v: string) => Number(v);
    const rows: [string, string][] = [
        ["Items", format(n(money.subtotal))],
        [
            fulfilment === "DELIVERY" ? "Delivery" : "Collection",
            n(money.shipping) > 0 ? format(n(money.shipping)) : "Free",
        ],
    ];
    if (n(money.discount) > 0) {
        rows.push([
            money.discountCode
                ? `Discount · ${money.discountCode.code}`
                : "Discount",
            `− ${format(n(money.discount))}`,
        ]);
    }

    const invoice = invoices?.find((i) => i.kind === "INVOICE") ?? null;
    const corrections = invoices?.filter((i) => i.kind !== "INVOICE") ?? [];
    const taxed = n(money.tax) > 0;
    const invoiceLabel =
        invoice?.number?.includes("/") || taxed ? "Tax invoice" : "Receipt";

    const provider =
        payments?.intents.find((i) => i.status === "SUCCEEDED")?.provider ??
        null;
    const paidBy = money.recordedByHand
        ? "Recorded by hand"
        : provider
          ? providerName(provider)
          : n(money.paid) > 0
            ? "Online payment"
            : paymentStatus === "FAILED"
              ? "Didn't go through"
              : "Not paid yet";
    const pay: [string, string][] = [["Paid by", paidBy]];
    if (n(money.paid) > 0) pay.push(["Taken", format(n(money.paid))]);
    if (n(money.refunded) > 0) {
        pay.push(["Refunded", format(n(money.refunded))]);
    }
    if (n(money.due) > 0) pay.push(["Still due", format(n(money.due))]);
    if (n(money.paid) > 0) {
        pay.push([
            "Lands",
            money.recordedByHand
                ? "Taken outside Saroh — cash or a transfer, not paid out by it"
                : `Your ${provider ? providerName(provider) : "provider"} account, on its payout schedule`,
        ]);
    }

    return (
        <Panel aria-labelledby="od-money">
            <PanelTitle id="od-money" className="mb-2">
                Money
            </PanelTitle>
            <dl>
                {rows.map(([k, v]) => (
                    <div key={k} className="flex py-[3px] text-[13px]">
                        <dt className="flex-1 text-muted-foreground">{k}</dt>
                        <dd className="tabular-nums">{v}</dd>
                    </div>
                ))}
                <div className="mt-[5px] flex border-t border-foreground/10 pb-[3px] pt-[7px] text-[14px] font-bold">
                    <dt className="flex-1">Total</dt>
                    <dd className="tabular-nums">{format(n(money.total))}</dd>
                </div>
            </dl>
            {n(money.refunded) > 0 ? (
                <div className="pt-[3px] text-[12.5px] font-semibold text-destructive-subtle-foreground">
                    {refundStanding === "REFUNDED"
                        ? "Refunded in full"
                        : `Refunded ${format(n(money.refunded))}`}
                </div>
            ) : null}
            {money.refundsBeingConfirmed.map((r) => (
                <div
                    key={r.id}
                    role="status"
                    className="mt-2 rounded-lg border border-border px-2.5 py-2 text-[12.5px]"
                >
                    <p className="text-pretty">
                        <span className="font-semibold">
                            {format(n(r.amount))} refund not confirmed yet.
                        </span>{" "}
                        <span className="text-muted-foreground">
                            {provider ? providerName(provider) : "The provider"}{" "}
                            didn&apos;t answer. The money is held until it does.
                        </span>
                    </p>
                    {onRetryRefund ? (
                        <Button
                            type="button"
                            variant="outline"
                            className={cn(actionClass("ghost"), "mt-2")}
                            disabled={busy}
                            onClick={() => onRetryRefund(r.id)}
                        >
                            Try again
                        </Button>
                    ) : null}
                </div>
            ))}
            {(money.owedBack ?? []).map((p) => (
                <div
                    key={p.id}
                    role="status"
                    className="mt-2 rounded-lg border border-border px-2.5 py-2 text-[12.5px]"
                >
                    <p className="text-pretty">
                        <span className="font-semibold">
                            {format(n(p.amount))} owed back to the customer.
                        </span>{" "}
                        <span className="text-muted-foreground">
                            They paid an earlier charge for a change that a
                            later edit replaced, so it isn&apos;t counted as
                            paid. Refund it from your{" "}
                            {provider ? providerName(provider) : "provider"}{" "}
                            dashboard; this clears once the refund comes
                            through.
                        </span>
                    </p>
                </div>
            ))}
            {!invoice && taxed ? (
                <div className="pt-[3px] text-[12.5px] text-muted-foreground">
                    Includes GST {format(n(money.tax))}
                </div>
            ) : null}
            <div aria-hidden className="mb-2 mt-2.5 h-px bg-foreground/10" />
            {invoice ? (
                <InvoiceLink
                    id={invoice.id}
                    label={`${invoiceLabel} ${invoice.number ?? ""}`.trim()}
                    sub={taxed ? `· GST ${format(n(money.tax))}` : null}
                />
            ) : null}
            {corrections.map((c) => (
                <InvoiceLink
                    key={c.id}
                    id={c.id}
                    label={`${KIND_LABEL[c.kind] ?? "Invoice"} ${c.number ?? ""}`.trim()}
                    sub={null}
                />
            ))}
            <dl>
                {pay.map(([k, v]) => (
                    <div
                        key={k}
                        className="flex gap-2.5 py-[3px] text-[12.5px]"
                    >
                        <dt className="w-16 shrink-0 text-muted-foreground">
                            {k}
                        </dt>
                        <dd className="min-w-0 flex-1 text-pretty tabular-nums">
                            {v}
                        </dd>
                    </div>
                ))}
            </dl>
            {payments && payments.intents.length > 0 ? (
                <details className="group mt-2 text-[12.5px]">
                    <summary
                        className={cn(
                            FOCUS,
                            "cursor-pointer rounded-md font-semibold text-muted-foreground hover:text-foreground coarse:py-2.5",
                        )}
                    >
                        Every payment attempt and refund
                    </summary>
                    <div className="mt-2">
                        <OrderPayments
                            summary={payments}
                            paymentStatus={paymentStatus}
                        />
                    </div>
                </details>
            ) : null}
        </Panel>
    );
}

function InvoiceLink({
    id,
    label,
    sub,
}: {
    id: string;
    label: string;
    sub: string | null;
}) {
    return (
        <Link
            href={`/billing/invoices/${encodeURIComponent(id)}`}
            className={cn(
                FOCUS,
                "mb-2 flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-[12.5px] text-foreground hover:bg-muted coarse:min-h-11",
            )}
        >
            <span className="min-w-0 flex-1">
                <span className="font-semibold">{label}</span>
                {sub ? (
                    <span className="text-muted-foreground"> {sub}</span>
                ) : null}
            </span>
            <ArrowRight aria-hidden className="size-3.5 shrink-0" />
        </Link>
    );
}

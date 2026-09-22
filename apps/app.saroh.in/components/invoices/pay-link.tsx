"use client";

import { Button } from "@saroh/ui/button";
import { showError, showSuccess } from "@saroh/ui/toast";
import { AlertTriangle, Copy, Link2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ViewerDate } from "@/components/shared/viewer-date";
import { createPayLink } from "@/lib/invoices/actions";
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

async function copy(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

/**
 * "Pay online" on an issued invoice (ADR-007, U13): a link the customer opens
 * to pay through the business's own provider.
 *
 * The link is copied the moment it is made — the preview links' rule — and
 * that is the only time its address exists: the API keeps a hash. So a link
 * made in this visit can be copied again, and an older one says plainly that
 * its address was shown once. "New link" makes another and the one shared
 * before stops working, which is also how a leaked link is shut.
 *
 * With no provider connected there is nothing to pay through, so the button
 * is replaced by where to connect one.
 */
export function PayLink({
    invoiceId,
    who,
    total,
    providerConnected,
    payLinkActive,
    canWrite,
}: {
    invoiceId: string;
    who: string;
    /** "₹1,400.00", for the sentences. */
    total: string;
    providerConnected: boolean;
    payLinkActive: boolean;
    canWrite: boolean;
}) {
    const [url, setUrl] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [confirming, setConfirming] = useState(false);

    if (!providerConnected) {
        return (
            <Panel>
                <p className="text-[13px] leading-[1.55] text-muted-foreground">
                    Connect a payment provider to take payment online.{" "}
                    {canWrite ? (
                        <Link
                            href="/settings/providers"
                            className="font-medium text-foreground underline underline-offset-4"
                        >
                            Connect one
                        </Link>
                    ) : null}
                </p>
            </Panel>
        );
    }

    if (!canWrite) {
        return (
            <Panel>
                <p className="text-[13px] leading-[1.55] text-muted-foreground">
                    {payLinkActive
                        ? `A pay link is out: ${who} can pay ${total} online.`
                        : "No pay link has been shared for this invoice."}
                </p>
            </Panel>
        );
    }

    async function make() {
        setBusy(true);
        const res = await createPayLink(invoiceId);
        setBusy(false);
        if (!res.ok) return showError(res.error);
        setUrl(res.data.url);
        const copied = await copy(res.data.url);
        showSuccess(
            copied
                ? `Pay link copied. Send it to ${who}.`
                : "Pay link ready. Copy it below.",
        );
    }

    async function copyAgain() {
        if (!url) return;
        if (await copy(url)) showSuccess("Pay link copied.");
        else showError("Couldn't copy. Select the link and copy it.");
    }

    return (
        <Panel>
            <p className="text-[13px] leading-[1.55] text-muted-foreground">
                {url
                    ? `${who} opens this to pay ${total} through your payment provider. Anyone with the link can see the invoice.`
                    : payLinkActive
                      ? "A pay link is out. Its address was shown once, when it was copied. Make a new one to copy it again — the one shared before stops working."
                      : `Send ${who} a link to pay ${total} online, through your payment provider. It stops working if the invoice is voided.`}
            </p>
            {url ? (
                <div className="mt-3 flex min-w-0 items-center gap-2">
                    <code
                        className="min-w-0 flex-1 truncate rounded-[8px] border border-border bg-background px-2.5 py-2 text-[12px]"
                        title={url}
                    >
                        {url}
                    </code>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void copyAgain()}
                    >
                        <Copy className="mr-1.5 size-4" />
                        Copy
                    </Button>
                </div>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
                {url || payLinkActive ? (
                    <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => setConfirming(true)}
                    >
                        {busy ? "Making a link…" : "New link"}
                    </Button>
                ) : (
                    <Button disabled={busy} onClick={() => void make()}>
                        <Link2 className="mr-1.5 size-4" />
                        {busy ? "Making a link…" : "Copy pay link"}
                    </Button>
                )}
            </div>
            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title="Make a new pay link?"
                description={`The link you shared before stops working straight away. Send ${who} the new one.`}
                confirmLabel="Make a new link"
                cancelLabel="Keep the old one"
                onConfirm={() => void make()}
            />
        </Panel>
    );
}

function Panel({ children }: { children: ReactNode }) {
    return (
        <section className="rounded-[12px] border border-border bg-card px-4 py-3.5 print:hidden">
            <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Pay online
            </h2>
            {children}
        </section>
    );
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

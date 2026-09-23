"use client";

import { Button } from "@saroh/ui/button";
import { showError, showSuccess } from "@saroh/ui/toast";
import Link from "next/link";
import { useEffect, useState } from "react";

import { InvoicePill } from "@/components/invoices/invoice-pill";
import { QuickLook, QuickLookCard } from "@/components/shared/quick-look";
import { ViewerDate } from "@/components/shared/viewer-date";
import { formatMoneyMajor } from "@/lib/format/money";
import { createPayLink, readInvoice } from "@/lib/invoices/actions";
import { customerHref, invoiceHref, sourceHref } from "@/lib/invoices/links";
import type { Invoice } from "@/lib/invoices/service";
import {
    billedTo,
    invoicePill,
    paidBy,
    sourceLine,
    whenLine,
} from "@/lib/invoices/status";

type Read =
    | { state: "loading" }
    | { state: "failed"; error: string }
    | { state: "ready"; invoice: Invoice };

/** What the paper is called: a tax invoice, a receipt, a credit note. */
export function paperTitle(
    i: Pick<Invoice, "gst" | "kind" | "standing">,
): string {
    if (i.kind === "CREDIT_NOTE") return "Credit note";
    if (i.gst) return "Tax invoice";
    return i.standing === "PAID" || i.standing === "CREDITED"
        ? "Receipt"
        : "Invoice";
}

/**
 * An invoice's quick look, from the Invoices list (the design's peek): who
 * it is billed to and what it connects to, the lines with their tax, how it
 * stands, and — while money is owed — its pay link. The list carries only a
 * summary of each invoice, so the lines are read when it opens.
 */
export function InvoiceQuickLook({
    invoice,
    canWrite,
    businessName,
    onOpenChange,
}: {
    businessName: string;
    /** The row it opened from; null when closed. */
    invoice: Invoice | null;
    canWrite: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const [read, setRead] = useState<Read>({ state: "loading" });
    const [attempt, setAttempt] = useState(0);
    const [copied, setCopied] = useState(false);
    const [busy, setBusy] = useState(false);
    const id = invoice?.id ?? null;

    // A new row starts a new read; the previous row's copy state goes too.
    const [wasId, setWasId] = useState(id);
    if (id !== wasId) {
        setWasId(id);
        setRead({ state: "loading" });
        setCopied(false);
    }

    useEffect(() => {
        if (!id) return;
        let live = true;
        void readInvoice(id).then((res) => {
            if (!live) return;
            setRead(
                res.ok
                    ? { state: "ready", invoice: res.data }
                    : { state: "failed", error: res.error },
            );
        });
        return () => {
            live = false;
        };
    }, [id, attempt]);

    // The row answers at once; the full read fills in the lines.
    const full = read.state === "ready" ? read.invoice : null;
    const i = full ?? invoice;
    if (!i) {
        return (
            <QuickLook
                open={false}
                onOpenChange={onOpenChange}
                title=""
                description=""
            >
                {null}
            </QuickLook>
        );
    }

    const money = (a: string) => formatMoneyMajor(a, i.currency) ?? a;
    const pill = invoicePill(i);
    const who = billedTo(i);
    const late = whenLine(i);
    const src = sourceHref(i);
    const owedHere =
        (i.standing === "ISSUED" || i.standing === "OVERDUE") &&
        i.kind !== "CREDIT_NOTE" &&
        !i.order;
    const canLink =
        canWrite && owedHere && (full?.online?.providerConnected ?? false);
    const linkOut = full?.online?.payLinkActive ?? false;
    const firstName = who.name.split(" ")[0] ?? who.name;

    async function copyLink() {
        if (!i) return;
        setBusy(true);
        const res = await createPayLink(i.id);
        setBusy(false);
        if (!res.ok) return showError(res.error);
        try {
            await navigator.clipboard.writeText(res.data.url);
            setCopied(true);
            showSuccess(`Pay link copied. Send it to ${who.name}.`);
        } catch {
            showError("Couldn't copy it. Open the invoice to copy the link.");
        }
    }

    const links = [
        i.related
            ? {
                  label: `${i.kind === "CREDIT_NOTE" ? "Cancels" : "Adds to"} ${i.related.number ?? "an invoice"}`,
                  href: invoiceHref(i.related.id),
              }
            : null,
        src
            ? { label: sourceLine({ ...i, kind: "INVOICE" }), href: src }
            : null,
        who.contactId
            ? {
                  label: `All of ${firstName}'s invoices`,
                  href: customerHref(who.contactId, true),
              }
            : null,
    ].filter((l): l is { label: string; href: string } => l !== null);

    return (
        <QuickLook
            open={invoice !== null}
            onOpenChange={onOpenChange}
            title={i.number ?? "Draft"}
            titleClassName="font-mono"
            subtitle={
                <>
                    {paperTitle(i)} ·{" "}
                    {i.issuedAt ? (
                        <ViewerDate iso={i.issuedAt} variant="dayMonth" />
                    ) : (
                        "not issued"
                    )}
                </>
            }
            status={<InvoicePill label={pill.label} variant={pill.variant} />}
            description={`${paperTitle(i)} for ${who.name}, ${money(i.total)}.`}
            footer={
                <>
                    {canLink ? (
                        <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void copyLink()}
                            className="h-[38px] px-4 text-[14px]"
                        >
                            {busy
                                ? "Making a link…"
                                : copied
                                  ? "Link copied"
                                  : linkOut
                                    ? "Copy a new pay link"
                                    : "Copy pay link"}
                        </Button>
                    ) : null}
                    <Button
                        asChild
                        className="h-[38px] min-w-[160px] flex-1 rounded-[10px] text-[13.5px]"
                    >
                        <Link href={invoiceHref(i.id)}>Open invoice</Link>
                    </Button>
                </>
            }
        >
            {i.standing === "OVERDUE" && i.dueAt ? (
                <div
                    role="alert"
                    className="rounded-[12px] border border-destructive-subtle-foreground bg-destructive-subtle px-3.5 py-[11px] text-[13px] font-bold text-destructive-subtle-foreground"
                >
                    {late.before} — due{" "}
                    <ViewerDate iso={i.dueAt} variant="dayMonth" />
                </div>
            ) : null}

            <QuickLookCard label="Billed to">
                {who.contactId ? (
                    <Link
                        href={customerHref(who.contactId)}
                        className="text-[14px] font-semibold text-foreground hover:underline"
                    >
                        {who.name}
                    </Link>
                ) : (
                    <p className="text-[14px] font-semibold text-foreground">
                        {who.name}
                    </p>
                )}
                {who.email || i.billTo?.gstin ? (
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                        {[
                            who.email,
                            i.billTo?.gstin ? `GSTIN ${i.billTo.gstin}` : null,
                        ]
                            .filter(Boolean)
                            .join(" · ")}
                    </p>
                ) : null}
                {links.length > 0 ? (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {links.map((l) => (
                            <Link
                                key={l.href}
                                href={l.href}
                                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border px-2.5 text-[12px] font-semibold text-foreground transition-colors duration-fast hover:border-border-strong coarse:h-11"
                            >
                                {l.label} <span aria-hidden>→</span>
                            </Link>
                        ))}
                    </div>
                ) : null}
            </QuickLookCard>

            <section
                aria-label="Lines"
                className="overflow-hidden rounded-[12px] border border-border bg-card"
                aria-busy={read.state === "loading"}
            >
                {read.state === "failed" ? (
                    <div
                        role="alert"
                        className="flex flex-wrap items-center gap-2 px-4 py-3 text-[13px] text-destructive-subtle-foreground"
                    >
                        <span className="flex-1">
                            The lines could not be loaded. {read.error}
                        </span>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setRead({ state: "loading" });
                                setAttempt((n) => n + 1);
                            }}
                        >
                            Try again
                        </Button>
                    </div>
                ) : full?.lines ? (
                    full.lines.map((l) => (
                        <div
                            key={l.id}
                            className="flex items-baseline gap-2.5 border-b border-border/70 px-4 py-[9px]"
                        >
                            <span className="min-w-0 flex-1 text-[13px]">
                                {l.description}
                            </span>
                            {l.quantity > 1 ? (
                                <span className="text-[12px] tabular-nums text-muted-foreground">
                                    {l.quantity} × {money(l.unitPrice)}
                                </span>
                            ) : null}
                            <span className="min-w-[70px] text-right text-[13px] font-semibold tabular-nums">
                                {money(l.amount)}
                            </span>
                        </div>
                    ))
                ) : (
                    <div className="grid gap-2 px-4 py-3" role="status">
                        <span className="sr-only">Loading the lines</span>
                        <div className="h-4 w-3/4 rounded-[6px] bg-muted" />
                        <div className="h-4 w-1/2 rounded-[6px] bg-muted" />
                    </div>
                )}
                <TaxRows
                    invoice={i}
                    money={money}
                    businessName={businessName}
                />
                <div className="flex border-t border-border px-4 pb-3 pt-[9px] text-[14.5px] font-bold">
                    <span className="flex-1">Total</span>
                    <span className="tabular-nums">
                        {i.kind === "CREDIT_NOTE" ? "−" : ""}
                        {money(i.total)}
                    </span>
                </div>
            </section>

            <p className="text-[12.5px] leading-[1.5] text-foreground">
                {payLine(i, money)}
                {canLink && linkOut && !copied
                    ? " A pay link is out; copying a new one stops the old one working."
                    : null}
            </p>
        </QuickLook>
    );
}

function TaxRows({
    invoice: i,
    money,
    businessName,
}: {
    invoice: Invoice;
    businessName: string;
    money: (a: string) => string;
}) {
    const rows: [string, string][] = i.gst
        ? [
              ["Taxable value", money(i.subtotal)],
              ...(i.gst.taxType === "INTER"
                  ? ([["IGST", money(i.gst.igst)]] as [string, string][])
                  : ([
                        ["CGST", money(i.gst.cgst)],
                        ["SGST", money(i.gst.sgst)],
                    ] as [string, string][])),
          ]
        : Number(i.tax) > 0
          ? [["Tax", money(i.tax)]]
          : [[`No GST — ${businessName} isn't registered`, ""]];
    return (
        <div className="py-1">
            {rows.map(([k, v]) => (
                <div
                    key={k}
                    className="flex px-4 py-[5px] text-[12.5px] text-muted-foreground"
                >
                    <span className="flex-1">{k}</span>
                    <span className="tabular-nums">{v}</span>
                </div>
            ))}
        </div>
    );
}

/** How it stands, in a sentence. */
function payLine(i: Invoice, money: (a: string) => string) {
    if (i.kind === "CREDIT_NOTE") {
        return `Cancels ${money(i.total)} of ${i.related?.number ?? "an invoice"}. Nothing is owed on a credit note.`;
    }
    if (i.order && (i.standing === "PAID" || i.standing === "CREDITED")) {
        return i.standing === "CREDITED"
            ? "Refunded on the order. A credit note cancels it."
            : "Paid with the order — its payments and refunds are made there.";
    }
    switch (i.standing) {
        case "PAID":
            return (
                <>
                    Paid
                    {i.paidAt ? (
                        <>
                            {" "}
                            <ViewerDate iso={i.paidAt} variant="dayMonth" />
                        </>
                    ) : null}
                    {i.payment ? ` by ${paidBy(i.payment.method)}` : ""}.
                </>
            );
        case "CREDITED":
            return "Cancelled. A credit note cancels it — nothing is owed.";
        case "VOID":
            return "Voided — nothing is owed.";
        case "DRAFT":
            return "A draft has no number and can still change.";
        default:
            return "Not paid. Send the pay link, or mark it paid when the money arrives.";
    }
}

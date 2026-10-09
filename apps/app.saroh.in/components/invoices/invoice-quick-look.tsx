"use client";

import { Button } from "@saroh/ui/button";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Copy } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { reportFailure } from "@/components/billing/plan-refusal";
import { InvoicePill } from "@/components/invoices/invoice-pill";
import {
    NewLinkConfirm,
    UnseenLinkNote,
} from "@/components/invoices/unseen-link";
import { QuickLook, QuickLookCard } from "@/components/shared/quick-look";
import { ViewerDate } from "@/components/shared/viewer-date";
import { formatMoneyMajor } from "@/lib/format/money";
import { readInvoice } from "@/lib/invoices/actions";
import { newPayLink } from "@/lib/invoices/link-actions";
import { customerHref, invoiceHref, sourceHref } from "@/lib/invoices/links";
import {
    copyLinkLabel,
    linkSight,
    mintedLink,
} from "@/lib/invoices/minted-links";
import {
    isExemptPaper,
    paperTitle,
    showsGstTotals,
} from "@/lib/invoices/paper-title";
import { printedSeller } from "@/lib/invoices/seller";
import { paysOnline } from "@/lib/invoices/send";
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
    timeZone,
}: {
    /**
     * The business's zone, which the invoice's dates are written in
     * (#836), as on the paper the customer gets. Absent, the viewer's.
     */
    timeZone?: string;
    businessName: string;
    /** The row it opened from; null when closed. */
    invoice: Invoice | null;
    canWrite: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const [read, setRead] = useState<Read>({ state: "loading" });
    const [attempt, setAttempt] = useState(0);
    // The pay link's address, once made or asked for again (UX-048): shown
    // inline, so a blocked clipboard never loses it.
    const [shown, setShown] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    // "Make a new link?" — asked before one replaces a link that is out.
    const [confirming, setConfirming] = useState(false);
    const id = invoice?.id ?? null;

    // A new row starts a new read; the previous row's copy state goes too.
    const [wasId, setWasId] = useState(id);
    if (id !== wasId) {
        setWasId(id);
        setRead({ state: "loading" });
        setShown(null);
        setConfirming(false);
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
        canWrite &&
        owedHere &&
        // Only where its link takes payment: the API's `payOnline` (DEC-070).
        paysOnline(full?.send, full?.online) &&
        // No link while autopay is charging it (D13).
        !full?.online?.autopayCharge;
    const linkOut = full?.online?.payLinkActive ?? false;
    const firstName = who.name.split(" ")[0] ?? who.name;

    // A link made for this invoice earlier in this tab: shown again as it
    // is, never replaced by a new one — unless the full read says it can't
    // be the one out any more: paid or void, or another link made since
    // (#870).
    const remembered = canLink
        ? mintedLink(i.id, {
              standing: full?.standing,
              updatedAt: full?.updatedAt,
              payLinkMadeAt: full?.online?.payLinkMadeAt,
          })
        : null;
    // One out that this tab didn't make (after a reload, or on another
    // device): it can't be shown, only replaced (UX-048, owner 8 Oct).
    const unseen =
        canLink &&
        !shown &&
        linkSight({ linkOut, held: remembered !== null }) === "unseen";

    async function copyText(url: string, made: boolean) {
        try {
            await navigator.clipboard.writeText(url);
            showSuccess(
                made
                    ? `Pay link copied. Send it to ${who.name}.`
                    : "Pay link copied.",
            );
        } catch {
            showError("Couldn't copy it. Select the link below and copy it.");
        }
    }

    async function copyLink() {
        if (!i) return;
        if (shown) return copyText(shown, false);
        setBusy(true);
        const res = await newPayLink(i.id, full?.updatedAt);
        setBusy(false);
        if (!res.ok) return reportFailure(res);
        setShown(res.data.url);
        await copyText(res.data.url, true);
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
                        <ViewerDate
                            iso={i.issuedAt}
                            variant="dayMonth"
                            timeZone={timeZone}
                        />
                    ) : (
                        "not issued"
                    )}
                </>
            }
            status={<InvoicePill label={pill.label} variant={pill.variant} />}
            description={`${paperTitle(i)} for ${who.name}, ${money(i.total)}.`}
            footer={
                <>
                    {canLink && remembered && !shown ? (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setShown(remembered)}
                            className="h-[38px] px-4 text-[14px]"
                        >
                            Show link again
                        </Button>
                    ) : canLink ? (
                        <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                                unseen ? setConfirming(true) : void copyLink()
                            }
                            className="h-[38px] px-4 text-[14px]"
                        >
                            {copyLinkLabel({
                                busy,
                                shown: shown !== null,
                                linkOut,
                            })}
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
                    <ViewerDate
                        iso={i.dueAt}
                        variant="dayMonth"
                        timeZone={timeZone}
                    />
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

            {canLink && shown ? (
                <ShownLink url={shown} onCopy={() => void copyLink()} />
            ) : null}

            <p className="text-[12.5px] leading-[1.5] text-foreground">
                {payLine(i, money)}
            </p>
            {unseen ? (
                <UnseenLinkNote
                    sendable={false}
                    madeAt={full?.online?.payLinkMadeAt}
                />
            ) : null}

            <NewLinkConfirm
                open={confirming}
                onOpenChange={setConfirming}
                who={who.name}
                onConfirm={() => void copyLink()}
            />
        </QuickLook>
    );
}

/**
 * The pay link's address, shown in place (UX-048): selectable, with its own
 * copy button, so it can be copied by hand when the clipboard is blocked.
 */
export function ShownLink({
    url,
    onCopy,
}: {
    url: string;
    onCopy: () => void;
}) {
    return (
        <div className="grid gap-1.5" aria-label="Pay link" role="group">
            <div className="flex min-w-0 items-center gap-2">
                <code className="min-w-0 flex-1 select-all break-all rounded-[7px] bg-muted px-[9px] py-[7px] font-mono text-[12px]">
                    {url}
                </code>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onCopy}
                    aria-label="Copy the pay link"
                >
                    <Copy aria-hidden className="size-4" />
                </Button>
            </div>
            <p className="text-[12px] leading-[1.45] text-muted-foreground">
                Kept here until you close this tab. Copying it again
                doesn&apos;t make a new link.
            </p>
        </div>
    );
}

export function TaxRows({
    invoice: i,
    money,
    businessName,
}: {
    invoice: Invoice;
    businessName: string;
    money: (a: string) => string;
}) {
    // A registered business's paper with no line rated: just the total
    // (DEC-072).
    if (i.gst && !isExemptPaper(i) && !showsGstTotals(i)) return null;
    // Named as on its paper: as at issue, or today's on a draft (DEC-082).
    const seller = printedSeller(i, {
        name: businessName,
        legalName: null,
        email: null,
    }).name;
    const rows: [string, string][] = isExemptPaper(i)
        ? [["Exempt from GST — no tax is charged", ""]]
        : i.gst
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
            : [[`No GST — ${seller} isn't registered`, ""]];
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
            // No online payment (DEC-070): there is no pay link to send.
            return paysOnline(i.send, i.online)
                ? "Not paid. Send the pay link, or mark it paid when the money arrives."
                : "Not paid. Send it, or mark it paid when the money arrives.";
    }
}

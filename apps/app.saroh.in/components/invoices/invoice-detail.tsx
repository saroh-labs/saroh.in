"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Copy } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";

import type { InvoiceRef } from "@/components/invoices/invoice-actions";
import {
    CancelInvoiceDialog,
    DeleteDraftDialog,
    IssueDialog,
    RecordPaymentDialog,
} from "@/components/invoices/invoice-actions";
import { InvoiceCrumbs } from "@/components/invoices/invoice-crumbs";
import { InvoicePill } from "@/components/invoices/invoice-pill";
import { SendDialog } from "@/components/invoices/send-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ReadOnlyNote } from "@/components/shared/read-only-note";
import { ViewerDate } from "@/components/shared/viewer-date";
import { createPayLink } from "@/lib/invoices/actions";
import { downloadInvoicePdf, hasPdf } from "@/lib/invoices/pdf";
import { canSend, wasSent } from "@/lib/invoices/send";
import type { InvoiceSend, InvoiceSent } from "@/lib/invoices/service";
import type { PillVariant } from "@/lib/invoices/status";

type Dialog =
    | "issue"
    | "delete"
    | "pay"
    | "cancel"
    | "refund"
    | "newLink"
    | "send"
    | "remind"
    | "draftSend";

async function copy(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

/**
 * One invoice, after "Saroh Invoice Detail": its number and status with
 * the actions its status allows, the paper as the customer gets it, and
 * beside it what it is connected to, how it is being paid and what has
 * happened to it.
 *
 * Actions by status — a draft is issued, edited or deleted; an unpaid one
 * gets its pay link copied, is marked paid, printed or cancelled; a paid one
 * is printed or refunded (an order's refund is made on the order, so stock
 * and the kitchen stay right). Any issued paper, whatever its status, has
 * "Download PDF" beside Print (D16): the same paper, drawn by the API. A
 * draft has none: it has no number yet.
 *
 * Sending (D17): where the API's `send` flag names a channel — the
 * business's own email, and later the customer's account thread — a draft
 * gets "Send with pay link" (issue and send), an unpaid one "Send with pay
 * link" and then "Send reminder", once a day. Where it names none, Saroh
 * doesn't send it: the pay link is copied for the merchant to send.
 */
export function InvoiceDetail({
    invoice,
    pill,
    subline,
    canWrite,
    registered,
    orderHref,
    editHref,
    online,
    send,
    sent,
    payLine,
    late,
    paper,
    connected,
    after,
}: {
    invoice: InvoiceRef & { kind: string };
    pill: { label: string; variant: PillVariant };
    subline: ReactNode;
    canWrite: boolean;
    /** Its paper is a tax invoice: it is cancelled by credit note. */
    registered: boolean;
    /** The order that owns it: its money moves there, never here. */
    orderHref: string | null;
    editHref: string;
    online: { providerConnected: boolean; payLinkActive: boolean } | null;
    /** Whether it can be sent, and how; null from an API before D17. */
    send: InvoiceSend | null;
    /** Its sends and reminders, newest first. */
    sent: InvoiceSent[];
    /** How it stands, in a sentence, for the Payment panel. */
    payLine: ReactNode;
    /** The overdue banner's words, when it is overdue. */
    late: ReactNode | null;
    paper: ReactNode;
    connected: ReactNode;
    /** Under the Payment panel: money to refund, what happened. */
    after: ReactNode;
}) {
    const [open, setOpen] = useState<Dialog | null>(null);
    const [url, setUrl] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const s = invoice.standing;
    const credit = invoice.kind === "CREDIT_NOTE";
    const owed = (s === "ISSUED" || s === "OVERDUE") && !credit && !orderHref;
    const canLink = owed && (online?.providerConnected ?? false);
    const sendable = canWrite && canSend(send);
    const reminding = wasSent(sent);
    const nextReminderAt = send?.nextReminderAt ?? null;
    const dialog = (d: Dialog) => (v: boolean) => setOpen(v ? d : null);

    async function makeLink() {
        setBusy(true);
        const res = await createPayLink(invoice.id);
        setBusy(false);
        if (!res.ok) return showError(res.error);
        setUrl(res.data.url);
        showSuccess(
            (await copy(res.data.url))
                ? `Pay link copied. Send it to ${invoice.who}.`
                : "Pay link ready. Copy it from the Payment panel.",
        );
    }

    function copyLink() {
        if (url) {
            void copy(url).then((ok) =>
                ok
                    ? showSuccess("Pay link copied.")
                    : showError("Couldn't copy. Select the link and copy it."),
            );
            return;
        }
        // The address of a link already out was shown once; a new one
        // retires it, so that is asked first.
        if (online?.payLinkActive) setOpen("newLink");
        else void makeLink();
    }

    const print = () => window.print();

    async function downloadPdf() {
        setDownloading(true);
        const res = await downloadInvoicePdf(invoice);
        setDownloading(false);
        if (!res.ok) showError(res.error);
    }
    // Reading the invoice is enough: the PDF is the paper the page shows.
    const pdf = hasPdf(invoice)
        ? [
              {
                  label: downloading ? "Making the PDF…" : "Download PDF",
                  disabled: downloading,
                  onClick: () => void downloadPdf(),
              },
          ]
        : [];
    interface Action {
        label: string;
        primary?: boolean;
        danger?: boolean;
        onClick?: () => void;
        href?: string;
        disabled?: boolean;
    }
    const actions: Action[] = [];
    if (canWrite && s === "DRAFT") {
        if (sendable) {
            actions.push({
                label: "Send with pay link",
                primary: true,
                onClick: () => setOpen("draftSend"),
            });
        }
        actions.push(
            {
                label: "Issue it",
                primary: !sendable,
                onClick: () => setOpen("issue"),
            },
            { label: "Edit", href: editHref },
            {
                label: "Delete draft",
                danger: true,
                onClick: () => setOpen("delete"),
            },
        );
    } else if (canWrite && owed) {
        if (sendable) {
            actions.push(
                reminding
                    ? {
                          label: "Send reminder",
                          primary: true,
                          // One a day: the Payment panel says when.
                          disabled: nextReminderAt !== null,
                          onClick: () => setOpen("remind"),
                      }
                    : {
                          label: "Send with pay link",
                          primary: true,
                          onClick: () => setOpen("send"),
                      },
            );
        }
        if (canLink) {
            actions.push({
                label: busy ? "Making a link…" : "Copy pay link",
                primary: !sendable,
                disabled: busy,
                onClick: copyLink,
            });
        }
        actions.push(
            {
                label: "Mark paid",
                primary: !canLink && !sendable,
                onClick: () => setOpen("pay"),
            },
            { label: "Print", onClick: print },
            ...pdf,
            {
                label: "Cancel invoice",
                danger: true,
                onClick: () => setOpen("cancel"),
            },
        );
    } else {
        actions.push({ label: "Print", primary: true, onClick: print }, ...pdf);
        if (canWrite && s === "PAID" && !credit) {
            actions.push(
                orderHref
                    ? {
                          label: "Refund on the order",
                          danger: true,
                          href: orderHref,
                      }
                    : {
                          label: "Refund…",
                          danger: true,
                          onClick: () => setOpen("refund"),
                      },
            );
        }
    }

    return (
        <div>
            <InvoiceCrumbs current={invoice.number ?? "Draft"} />
            <div className="mb-4 flex flex-wrap items-start gap-3.5 print:hidden">
                <div className="min-w-0 flex-[1_1_300px]">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <h1 className="font-mono text-[26px] font-medium leading-[1.2] tracking-[-0.02em]">
                            {invoice.number ?? "Draft"}
                        </h1>
                        <InvoicePill
                            label={pill.label}
                            variant={pill.variant}
                        />
                    </div>
                    <p className="mt-1 text-[12.5px] text-muted-foreground">
                        {subline}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {actions.map((a) => {
                        const cls = cn(
                            "h-[38px] cursor-pointer rounded-[9px] px-4 text-[14px]",
                            a.danger &&
                                "text-destructive-subtle-foreground hover:text-destructive-subtle-foreground",
                        );
                        const variant = a.primary ? "default" : "outline";
                        return a.href ? (
                            <Button
                                key={a.label}
                                asChild
                                variant={variant}
                                className={cls}
                            >
                                <Link href={a.href}>{a.label}</Link>
                            </Button>
                        ) : (
                            <Button
                                key={a.label}
                                type="button"
                                variant={variant}
                                className={cls}
                                disabled={a.disabled}
                                onClick={a.onClick}
                            >
                                {a.label}
                            </Button>
                        );
                    })}
                </div>
            </div>

            {!canWrite ? (
                <ReadOnlyNote className="print:hidden">
                    Your role can read this invoice but not change it.
                </ReadOnlyNote>
            ) : null}

            {late ? (
                <div
                    role="alert"
                    className="mb-3.5 rounded-[12px] border border-destructive-subtle-foreground bg-destructive-subtle px-4 py-3 text-[13px] font-semibold text-destructive-subtle-foreground print:hidden"
                >
                    {late}
                </div>
            ) : null}

            <div className="flex flex-wrap items-start gap-4">
                <div className="min-w-0 flex-[3_1_460px]">{paper}</div>
                <div className="flex min-w-0 flex-[2_1_280px] flex-col gap-3 print:hidden">
                    {connected}
                    <section className="rounded-[12px] border border-border bg-card px-4 py-[13px]">
                        <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                            Payment
                        </h2>
                        <p className="text-[13px] leading-[1.5] text-foreground">
                            {payLine}
                        </p>
                        {owed ? (
                            url ? (
                                <div className="mt-2 flex min-w-0 items-center gap-2">
                                    <code className="min-w-0 flex-1 break-all rounded-[7px] bg-muted px-[9px] py-[7px] font-mono text-[12px]">
                                        {url}
                                    </code>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={copyLink}
                                        aria-label="Copy the pay link"
                                    >
                                        <Copy aria-hidden className="size-4" />
                                    </Button>
                                </div>
                            ) : !online?.providerConnected ? (
                                <p className="mt-2 text-[12.5px] leading-[1.5] text-muted-foreground">
                                    Connect a payment provider to take payment
                                    online.{" "}
                                    {canWrite ? (
                                        <Link
                                            href="/settings/providers"
                                            className="font-medium text-foreground underline underline-offset-4"
                                        >
                                            Connect one
                                        </Link>
                                    ) : null}
                                </p>
                            ) : online.payLinkActive ? (
                                <p className="mt-2 text-[12.5px] leading-[1.5] text-muted-foreground">
                                    A pay link is out. Its address was shown
                                    once, when it was copied — copying it again
                                    {sendable ? " or sending it" : ""} makes a
                                    new one, and the old one stops working.
                                </p>
                            ) : null
                        ) : null}
                        {owed && sendable && reminding && nextReminderAt ? (
                            <p className="mt-2 text-[12.5px] leading-[1.5] text-muted-foreground">
                                One reminder a day. The next can go after{" "}
                                <ViewerDate
                                    iso={nextReminderAt}
                                    variant="datetime"
                                />
                                .
                            </p>
                        ) : null}
                        {owed &&
                        canWrite &&
                        send?.reason === "NO_EMAIL_PROVIDER" ? (
                            <p className="mt-2 text-[12.5px] leading-[1.5] text-muted-foreground">
                                To send invoices by email, connect your email
                                provider.{" "}
                                <Link
                                    href="/settings/providers"
                                    className="font-medium text-foreground underline underline-offset-4"
                                >
                                    Providers
                                </Link>
                            </p>
                        ) : null}
                    </section>
                    {after}
                </div>
            </div>

            <IssueDialog
                open={open === "issue"}
                onOpenChange={dialog("issue")}
                invoice={invoice}
                canSend={sendable}
            />
            {send && sendable ? (
                <SendDialog
                    open={
                        open === "send" ||
                        open === "remind" ||
                        open === "draftSend"
                    }
                    onOpenChange={(v) => {
                        if (!v) setOpen(null);
                    }}
                    invoice={invoice}
                    send={send}
                    mode={
                        open === "remind"
                            ? "reminder"
                            : open === "draftSend"
                              ? "draft"
                              : "send"
                    }
                />
            ) : null}
            <DeleteDraftDialog
                open={open === "delete"}
                onOpenChange={dialog("delete")}
                invoice={invoice}
            />
            <RecordPaymentDialog
                open={open === "pay"}
                onOpenChange={dialog("pay")}
                invoice={invoice}
            />
            <CancelInvoiceDialog
                open={open === "cancel"}
                onOpenChange={dialog("cancel")}
                invoice={invoice}
                registered={registered}
            />
            <CancelInvoiceDialog
                open={open === "refund"}
                onOpenChange={dialog("refund")}
                invoice={invoice}
                registered={registered}
                refund
            />
            <ConfirmDialog
                open={open === "newLink"}
                onOpenChange={dialog("newLink")}
                title="Make a new pay link?"
                description={`The link you shared before stops working straight away. Send ${invoice.who} the new one.`}
                confirmLabel="Make a new link"
                cancelLabel="Keep the old one"
                onConfirm={() => void makeLink()}
            />
        </div>
    );
}

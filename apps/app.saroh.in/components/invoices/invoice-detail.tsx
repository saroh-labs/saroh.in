"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Copy } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useId, useState } from "react";

import { reportFailure } from "@/components/billing/plan-refusal";
import { EmailNoteText } from "@/components/communications/email-note";
import type { InvoiceRef } from "@/components/invoices/invoice-actions";
import {
    CancelInvoiceDialog,
    DeleteDraftDialog,
    IssueDialog,
    RecordPaymentDialog,
} from "@/components/invoices/invoice-actions";
import { InvoiceCrumbs } from "@/components/invoices/invoice-crumbs";
import { InvoicePill } from "@/components/invoices/invoice-pill";
import { OfflinePayHint } from "@/components/invoices/offline-pay-hint";
import { SendDialog } from "@/components/invoices/send-dialog";
import {
    NewLinkConfirm,
    UnseenLinkNote,
} from "@/components/invoices/unseen-link";
import { useBusinessDetailsStep } from "@/components/organizations/use-business-details-step";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ReadOnlyNote } from "@/components/shared/read-only-note";
import { ViewerDate } from "@/components/shared/viewer-date";
import type { EmailNote } from "@/lib/communications/email-setup";
import { INVOICE_EMAIL_WORDS } from "@/lib/communications/email-setup";
import { createPayLink, createViewLink } from "@/lib/invoices/actions";
import type { DetailActionId } from "@/lib/invoices/detail-actions";
import { detailActions, owedHere } from "@/lib/invoices/detail-actions";
import { mintedLink, rememberLink } from "@/lib/invoices/minted-links";
import { downloadInvoicePdf, hasPdf } from "@/lib/invoices/pdf";
import { canSend, paysOnline, wasSent } from "@/lib/invoices/send";
import type { InvoiceSend, InvoiceSent } from "@/lib/invoices/service";
import type { PillVariant } from "@/lib/invoices/status";
import type { OnlineBlocker } from "@/lib/staff/types";

type Dialog =
    | "issue"
    | "delete"
    | "pay"
    | "cancel"
    | "refund"
    | "newLink"
    | "newViewLink"
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
 *
 * Without online payment (`payOnline` false, DEC-070) the link only shows
 * the invoice: Send reads "Send invoice", and there is no pay link to copy.
 * "Copy view link" copies that link instead (#833): the invoice on the
 * business's site with no Pay button and with "How to pay us", for a
 * business that can't email it. Where the plan is what keeps online
 * payment off (#835), the Payment panel says it comes with a paid plan
 * rather than "Connect a payment provider". The buttons are
 * `detailActions`'.
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
    paymentsOn = true,
    emailNote = null,
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
    online: {
        providerConnected: boolean;
        payLinkActive: boolean;
        /** An autopay charge under way (D13): the pay link is held. */
        autopayCharge?: { at: string } | null;
        /** Why its link can't take payment (#835); absent from an older API. */
        onlineBlocker?: OnlineBlocker | null;
    } | null;
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
    /**
     * The Payments module is on (unknown reads as on). Only which hint the
     * Payment panel gives: with it off, connecting a provider wouldn't
     * make the link take payment, so it isn't suggested.
     */
    paymentsOn?: boolean;
    /**
     * Why it can't be emailed when the business has no email provider of
     * its own, with the way to fix it for this person (`emailRefusalNote`).
     */
    emailNote?: EmailNote | null;
}) {
    const [open, setOpen] = useState<Dialog | null>(null);
    // A pay link waits for the registered address (DEC-068): asked here.
    const details = useBusinessDetailsStep({
        then: "make its pay link",
        continueLabel: "Save and make link",
    });
    // A pay link made for it earlier in this tab, shown again (UX-048):
    // its address can't be read back from the API.
    const [url, setUrl] = useState<string | null>(() => mintedLink(invoice.id));
    // A view link (#833) or a pay link: what the copied address opens.
    const [urlKind, setUrlKind] = useState<"pay" | "view">("pay");
    const [busy, setBusy] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const s = invoice.standing;
    const credit = invoice.kind === "CREDIT_NOTE";
    const owed = owedHere({ standing: s, credit, fromOrder: !!orderHref });
    // While autopay is charging it (D13), no link: the customer would pay twice.
    const charging = owed ? (online?.autopayCharge ?? null) : null;
    // The API says whether its link takes payment (DEC-070); never guessed.
    const payOnline = paysOnline(send, online);
    const sendable = canWrite && canSend(send);
    const reminding = wasSent(sent);
    const nextReminderAt = send?.nextReminderAt ?? null;
    const dialog = (d: Dialog) => (v: boolean) => setOpen(v ? d : null);

    async function makeLink() {
        setBusy(true);
        const res = await details.run(() => createPayLink(invoice.id));
        setBusy(false);
        if (!res) return;
        // A plan without online payments: its notice and the way up.
        if (!res.ok) return reportFailure(res);
        rememberLink(invoice.id, res.data.url);
        setUrl(res.data.url);
        setUrlKind("pay");
        showSuccess(
            (await copy(res.data.url))
                ? `Pay link copied. Send it to ${invoice.who}.`
                : "Pay link ready. Copy it from the Payment panel.",
        );
    }

    /** No pay link can be made (#833): a link to view it and how to pay. */
    async function makeViewLink() {
        setBusy(true);
        const res = await details.run(() => createViewLink(invoice.id));
        setBusy(false);
        if (!res) return;
        if (!res.ok) return reportFailure(res);
        setUrl(res.data.url);
        setUrlKind("view");
        showSuccess(
            (await copy(res.data.url))
                ? `Link copied. Send it to ${invoice.who}: it shows the invoice and how to pay you.`
                : "Link ready. Copy it from the Payment panel.",
        );
    }

    function copyShown() {
        if (!url) return;
        void copy(url).then((ok) =>
            ok
                ? showSuccess(
                      urlKind === "view" ? "Link copied." : "Pay link copied.",
                  )
                : showError("Couldn't copy. Select the link and copy it."),
        );
    }

    function copyLink() {
        if (url && urlKind === "pay") return copyShown();
        // The address of a link already out was shown once; a new one
        // retires it, so that is asked first.
        if (online?.payLinkActive) setOpen("newLink");
        else void makeLink();
    }

    function copyViewLink() {
        if (url && urlKind === "view") return copyShown();
        if (online?.payLinkActive) setOpen("newViewLink");
        else void makeViewLink();
    }

    const print = () => window.print();

    async function downloadPdf() {
        setDownloading(true);
        const res = await downloadInvoicePdf(invoice);
        setDownloading(false);
        if (!res.ok) showError(res.error);
    }
    // Reading the invoice is enough: the PDF is the paper the page shows.
    const does: Record<
        DetailActionId,
        { onClick?: () => void; href?: string }
    > = {
        draftSend: { onClick: () => setOpen("draftSend") },
        issue: { onClick: () => setOpen("issue") },
        edit: { href: editHref },
        delete: { onClick: () => setOpen("delete") },
        send: { onClick: () => setOpen("send") },
        // One a day: the Payment panel says when.
        remind: { onClick: () => setOpen("remind") },
        copyLink: { onClick: copyLink },
        copyViewLink: { onClick: copyViewLink },
        pay: { onClick: () => setOpen("pay") },
        print: { onClick: print },
        pdf: { onClick: () => void downloadPdf() },
        cancel: { onClick: () => setOpen("cancel") },
        refund: { onClick: () => setOpen("refund") },
        refundOrder: { href: orderHref ?? undefined },
    };
    const readOnlyId = useId();
    const actions = detailActions({
        standing: s,
        credit,
        fromOrder: !!orderHref,
        canWrite,
        sendable,
        reminding,
        reminderWaits: nextReminderAt !== null,
        payOnline,
        charging: !!charging,
        hasPdf: hasPdf(invoice),
        linkBusy: busy,
        // A link is out that this tab can't show: the button makes a new
        // one, confirmed first (UX-048).
        linkUnseen: !!online?.payLinkActive && !(url && urlKind === "pay"),
        pdfBusy: downloading,
    }).map((a) => ({ ...a, ...does[a.id] }));

    return (
        <div>
            {details.step}
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
                                key={a.id}
                                asChild
                                variant={variant}
                                className={cls}
                            >
                                <Link href={a.href}>{a.label}</Link>
                            </Button>
                        ) : (
                            <Button
                                key={a.id}
                                type="button"
                                variant={variant}
                                className={cls}
                                disabled={a.disabled}
                                aria-describedby={
                                    a.reason ? readOnlyId : undefined
                                }
                                onClick={a.onClick}
                            >
                                {a.label}
                            </Button>
                        );
                    })}
                </div>
            </div>

            {!canWrite ? (
                <ReadOnlyNote id={readOnlyId} className="print:hidden">
                    {actions.find((a) => a.reason)?.reason ??
                        "Your role can read this invoice but not change it."}
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
                        {charging ? (
                            <p className="mt-2 text-[12.5px] leading-[1.5] text-muted-foreground">
                                <span className="font-semibold text-foreground">
                                    Autopay charge in progress ·{" "}
                                    <ViewerDate iso={charging.at} />
                                </span>
                                . The pay link and reminders are held until{" "}
                                {invoice.who}&apos;s bank answers, so
                                they&apos;re never charged twice.
                            </p>
                        ) : owed ? (
                            url ? (
                                <div className="mt-2 flex min-w-0 items-center gap-2">
                                    <code className="min-w-0 flex-1 break-all rounded-[7px] bg-muted px-[9px] py-[7px] font-mono text-[12px]">
                                        {url}
                                    </code>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={copyShown}
                                        aria-label={
                                            urlKind === "view"
                                                ? "Copy the link"
                                                : "Copy the pay link"
                                        }
                                    >
                                        <Copy aria-hidden className="size-4" />
                                    </Button>
                                </div>
                            ) : !payOnline ? (
                                <OfflinePayHint
                                    blocker={online?.onlineBlocker ?? null}
                                    paymentsOn={paymentsOn}
                                    providerConnected={
                                        online?.providerConnected ?? false
                                    }
                                    canWrite={canWrite}
                                    who={invoice.who}
                                />
                            ) : online?.payLinkActive ? (
                                // Out, but not made in this tab: it can't
                                // be shown, only replaced (UX-048).
                                <UnseenLinkNote
                                    sendable={sendable}
                                    className="mt-2"
                                />
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
                            // No email of its own (DEC-011): why, and the
                            // way to fix it for who may — the note every
                            // refused send shows.
                            <p className="mt-2 text-[12.5px] leading-[1.5] text-muted-foreground">
                                <EmailNoteText
                                    note={
                                        emailNote ?? {
                                            text: INVOICE_EMAIL_WORDS.connect,
                                            action: null,
                                        }
                                    }
                                />
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
                payOnline={payOnline}
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
            <NewLinkConfirm
                open={open === "newLink"}
                onOpenChange={dialog("newLink")}
                who={invoice.who}
                onConfirm={() => void makeLink()}
            />
            <ConfirmDialog
                open={open === "newViewLink"}
                onOpenChange={dialog("newViewLink")}
                title="Make a new link?"
                description={`The link you shared before stops working straight away. Send ${invoice.who} the new one.`}
                confirmLabel="Make a new link"
                cancelLabel="Keep the old one"
                onConfirm={() => void makeViewLink()}
            />
        </div>
    );
}

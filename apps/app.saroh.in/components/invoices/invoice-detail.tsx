"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Copy, Link2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useId, useReducer, useState } from "react";

import { refusedResult } from "@/components/billing/plan-refusal";
import { EmailNoteText } from "@/components/communications/email-note";
import { CancelOrCorrectSheet } from "@/components/invoices/cancel-or-correct-sheet";
import type { InvoiceRef } from "@/components/invoices/invoice-actions";
import {
    DeleteDraftDialog,
    IssueDialog,
    RecordPaymentDialog,
    RefundInvoiceDialog,
} from "@/components/invoices/invoice-actions";
import { OfflinePayHint } from "@/components/invoices/offline-pay-hint";
import { useInvoiceSend } from "@/components/invoices/send-dialog";
import {
    NewLinkConfirm,
    UnseenLinkNote,
} from "@/components/invoices/unseen-link";
import { useWriteAgain } from "@/components/invoices/use-write-again";
import { useBusinessDetailsStep } from "@/components/organizations/use-business-details-step";
import { QrButton } from "@/components/qr/qr-button";
import type { ConfirmResult } from "@/components/shared/confirm-dialog";
import { ConfirmDialog, sayRefusal } from "@/components/shared/confirm-dialog";
import { ReadOnlyNote } from "@/components/shared/read-only-note";
import { StatusBadge } from "@/components/shared/status-badge";
import { ViewerDate } from "@/components/shared/viewer-date";
import { runAction } from "@/lib/api/run-action";
import type { EmailNote } from "@/lib/communications/email-setup";
import { INVOICE_EMAIL_WORDS } from "@/lib/communications/email-setup";
import type { DetailActionId } from "@/lib/invoices/detail-actions";
import { detailActions, owedHere } from "@/lib/invoices/detail-actions";
import { newPayLink, newViewLink } from "@/lib/invoices/link-actions";
import { mintedLink } from "@/lib/invoices/minted-links";
import { downloadInvoicePdf, hasPdf } from "@/lib/invoices/pdf";
import { canSend, paysOnline, wasSent } from "@/lib/invoices/send";
import type { InvoiceSend, InvoiceSent } from "@/lib/invoices/service";
import type { PillVariant } from "@/lib/invoices/status";
import type { OnlineBlocker } from "@/lib/staff/types";
import { copyFailedMessage, copyText } from "@saroh/ui/copy-button";
import { Notice } from "@saroh/ui/notice";

type Dialog =
    | "issue"
    | "delete"
    | "pay"
    | "cancel"
    | "refund"
    | "newLink"
    | "newViewLink";

/**
 * One invoice, after "Saroh Invoice Detail": its number and status with
 * the actions its status allows, the paper as the customer gets it, and
 * beside it what it is connected to, how it is being paid and what has
 * happened to it.
 *
 * Actions by status — a draft is issued, edited or deleted; an unpaid one
 * gets its payment link copied, is marked paid, printed or cancelled; a paid one
 * is printed or refunded (an order's refund is made on the order, so stock
 * and the kitchen stay right). Any issued paper, whatever its status, has
 * "Download PDF" beside Print (D16): the same paper, drawn by the API. A
 * draft has none: it has no number yet.
 *
 * Sending (D17): where the API's `send` flag names a channel — the
 * business's own email, and later the customer's account thread — a draft
 * gets "Send with payment link" (issue and send), an unpaid one "Send with pay
 * link" and then "Send reminder", once a day. Where it names none, Saroh
 * doesn't send it: the payment link is copied for the merchant to send.
 *
 * Without online payment (`payOnline` false, DEC-070) the link only shows
 * the invoice: Send reads "Send invoice", and there is no payment link to copy.
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
    invoice: InvoiceRef & {
        kind: string;
        /** Issued, some paid, some left (DEC-173): not cancelled yet. */
        partlyPaid?: boolean;
        /** What has come in so far, as shown: "₹1,000". */
        paidSoFar?: string | null;
        /** The draft it was written again as, if any (a void one's Write again). */
        reissuedAsId?: string | null;
        /**
         * When it last changed: a link made here is forgotten once it
         * changes again, since a send, a view link or the customer's own
         * "Pay now" may have replaced it (#870).
         */
        updatedAt?: string;
    };
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
        /** When the link out was made (#870); absent from an older API. */
        payLinkMadeAt?: string | null;
        /** An autopay charge under way (D13): the payment link is held. */
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
    // A payment link waits for the registered address (DEC-068): asked here.
    const details = useBusinessDetailsStep({
        then: "make its payment link",
        continueLabel: "Save and make link",
    });
    // A view link just made (#833): shown until something replaces it.
    const [viewUrl, setViewUrl] = useState<string | null>(null);
    // Sending tells a customer: held ten seconds with Undo, nothing asked,
    // except from a draft, whose issuing is asked once (`useInvoiceSend`).
    const sending = useInvoiceSend({
        invoice,
        send: canWrite && canSend(send) ? send : null,
        // It went with a fresh link: the one shown is dead.
        onSent: () => setViewUrl(null),
    });
    // A payment link is kept outside React (UX-048); this redraws once it is.
    const [, redraw] = useReducer((n: number) => n + 1, 0);
    const [busy, setBusy] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const writing = useWriteAgain();
    const s = invoice.standing;
    // A payment link made for it earlier in this tab, shown again (UX-048): its
    // address can't be read back from the API. Not once it is paid or void,
    // or changed since (#870): then it isn't the link that is out.
    const payUrl = mintedLink(invoice.id, {
        standing: s,
        updatedAt: invoice.updatedAt,
        payLinkMadeAt: online?.payLinkMadeAt,
    });
    const url = viewUrl ?? payUrl;
    // A view link (#833) or a payment link: what the copied address opens.
    const urlKind: "pay" | "view" = viewUrl ? "view" : "pay";
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

    /** The refusal comes back, for the confirm that asked or a toast. */
    async function makeLink(): Promise<ConfirmResult> {
        const res = await runAction(
            () => details.run(() => newPayLink(invoice.id, invoice.updatedAt)),
            { setBusy },
        );
        if (!res) return;
        // A plan without online payments: its notice and the way up.
        if (!res.ok) return refusedResult(res);
        setViewUrl(null);
        redraw();
        showSuccess(
            (await copyText(res.data.url))
                ? `Payment link copied. Send it to ${invoice.who}.`
                : "Payment link ready. Copy it from the Payment panel.",
        );
    }

    /** No payment link can be made (#833): a link to view it and how to pay. */
    async function makeViewLink(): Promise<ConfirmResult> {
        // It replaces the payment link this tab made, which is forgotten.
        const res = await runAction(
            () => details.run(() => newViewLink(invoice.id)),
            { setBusy },
        );
        if (!res) return;
        if (!res.ok) return refusedResult(res);
        setViewUrl(res.data.url);
        showSuccess(
            (await copyText(res.data.url))
                ? s === "PAID"
                    ? `Link copied. Send it to ${invoice.who}: it shows the invoice, paid.`
                    : `Link copied. Send it to ${invoice.who}: it shows the invoice and how to pay you.`
                : "Link ready. Copy it from the Payment panel.",
        );
    }

    function copyShown() {
        if (!url) return;
        void copyText(url).then((ok) =>
            ok
                ? showSuccess(
                      urlKind === "view"
                          ? "Link copied."
                          : "Payment link copied.",
                  )
                : showError(copyFailedMessage()),
        );
    }

    function copyLink() {
        if (payUrl && !viewUrl) return copyShown();
        // The address of a link already out was shown once; a new one
        // retires it, so that is asked first.
        if (online?.payLinkActive) setOpen("newLink");
        else void makeLink().then(sayRefusal);
    }

    function copyViewLink() {
        if (viewUrl) return copyShown();
        if (online?.payLinkActive) setOpen("newViewLink");
        else void makeViewLink().then(sayRefusal);
    }

    const print = () => window.print();

    async function downloadPdf() {
        const res = await runAction(() => downloadInvoicePdf(invoice), {
            setBusy: setDownloading,
        });
        if (!res) return;
        if (!res.ok) showError(res.error);
    }
    // Reading the invoice is enough: the PDF is the paper the page shows.
    const does: Record<
        DetailActionId,
        { onClick?: () => void; href?: string }
    > = {
        draftSend: { onClick: sending.askDraft },
        issue: { onClick: () => setOpen("issue") },
        edit: { href: editHref },
        delete: { onClick: () => setOpen("delete") },
        send: { onClick: () => sending.start(false) },
        // One a day: the Payment panel says when.
        remind: { onClick: () => sending.start(true) },
        copyLink: { onClick: copyLink },
        copyViewLink: { onClick: copyViewLink },
        pay: { onClick: () => setOpen("pay") },
        print: { onClick: print },
        pdf: { onClick: () => void downloadPdf() },
        cancel: { onClick: () => setOpen("cancel") },
        refund: { onClick: () => setOpen("refund") },
        refundOrder: { href: orderHref ?? undefined },
        writeAgain: { onClick: () => void writing.run(invoice) },
    };
    const readOnlyId = useId();
    /** The link made in this tab, to copy again from the Payment panel. */
    const linkBox = url ? (
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
                        : "Copy the payment link"
                }
            >
                <Copy aria-hidden className="size-4" />
            </Button>
            <QrButton
                compact="always"
                link={{
                    mode: "instant",
                    url,
                    what:
                        urlKind === "view"
                            ? "this invoice's link"
                            : "this invoice's payment link",
                    opens: urlKind === "view" ? "invoice" : "pay",
                    fileName:
                        urlKind === "view" ? "invoice-link-qr" : "pay-link-qr",
                }}
            />
        </div>
    ) : null;
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
        linkUnseen: !!online?.payLinkActive && !(payUrl && !viewUrl),
        pdfBusy: downloading,
        writeAgain: invoice.kind === "INVOICE" && !invoice.reissuedAsId,
    }).map((a) => ({ ...a, ...does[a.id] }));

    return (
        <div>
            {details.step}
            <PageHeader
                holdsData
                className="mb-4 print:hidden"
                breadcrumb={[
                    "Payments",
                    <Link key="list" href="/billing/invoices">
                        Invoices
                    </Link>,
                    invoice.number ?? "Draft",
                ]}
                // A number is a measured value: the mono face, at the
                // title's size.
                title={
                    <span className="font-mono font-medium">
                        {invoice.number ?? "Draft"}
                    </span>
                }
                badge={
                    <StatusBadge tone={pill.variant} size="default">
                        {pill.label}
                    </StatusBadge>
                }
                description={subline}
                actions={
                    <>
                        {actions.map((a) => {
                            const cls = cn(
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
                    </>
                }
            />

            {!canWrite ? (
                <ReadOnlyNote id={readOnlyId} className="print:hidden">
                    {actions.find((a) => a.reason)?.reason ??
                        "Your role can read this invoice but not change it."}
                </ReadOnlyNote>
            ) : null}

            {late ? (
                <Notice tone="error" className="mb-3.5 print:hidden">
                    {late}
                </Notice>
            ) : null}

            <div className="flex flex-wrap items-start gap-4">
                <div className="min-w-0 flex-[3_1_460px]">{paper}</div>
                <div className="flex min-w-0 flex-[2_1_280px] flex-col gap-3 print:hidden">
                    {connected}
                    <section className="rounded-[12px] border border-border bg-card px-4 py-[13px]">
                        <h2 className="label mb-1.5">Payment</h2>
                        <p className="text-[13px] leading-[1.5] text-foreground">
                            {payLine}
                        </p>
                        {charging ? (
                            <p className="mt-2 text-[12.5px] leading-[1.5] text-muted-foreground">
                                <span className="font-semibold text-foreground">
                                    Autopay charge in progress ·{" "}
                                    <ViewerDate iso={charging.at} />
                                </span>
                                . The payment link and reminders are held until{" "}
                                {invoice.who}&apos;s bank answers, so
                                they&apos;re never charged twice.
                            </p>
                        ) : owed ? (
                            url ? (
                                linkBox
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
                                    madeAt={online.payLinkMadeAt}
                                    className="mt-2"
                                />
                            ) : null
                        ) : url && urlKind === "view" ? (
                            // A paid one's view link (UX-080), made here.
                            linkBox
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
            {sending.overlays}
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
            <CancelOrCorrectSheet
                open={open === "cancel"}
                onOpenChange={dialog("cancel")}
                invoice={invoice}
                registered={registered}
            />
            <RefundInvoiceDialog
                open={open === "refund"}
                onOpenChange={dialog("refund")}
                invoice={invoice}
            />
            <NewLinkConfirm
                open={open === "newLink"}
                onOpenChange={dialog("newLink")}
                who={invoice.who}
                onConfirm={makeLink}
            />
            <ConfirmDialog
                open={open === "newViewLink"}
                onOpenChange={dialog("newViewLink")}
                tone="neutral"
                icon={Link2}
                title="Make a new link?"
                description={`The link you shared before stops working straight away. Send ${invoice.who} the new one. This cannot be undone.`}
                confirmLabel="Make a new link"
                keepLabel="Keep the old link"
                onConfirm={makeViewLink}
            />
        </div>
    );
}

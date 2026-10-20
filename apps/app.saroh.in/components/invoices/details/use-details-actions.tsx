"use client";

import { Button } from "@saroh/ui/button";
import { copyFailedMessage, copyText } from "@saroh/ui/copy-button";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Copy, Link2 } from "lucide-react";
import type { ReactNode } from "react";
import { useReducer, useRef, useState } from "react";

import { refusedResult } from "@/components/billing/plan-refusal";
import { cancelTargetOf } from "@/components/invoices/cancel-or-correct-sheet";
import {
    ChequeBouncedDialog,
    ChequeClearedDialog,
} from "@/components/invoices/cheque-dialogs";
import type { ActionDoes } from "@/components/invoices/details/action-bar";
import {
    useCancelFlow,
    useRecordPaymentFlow,
    useShareFlow,
} from "@/components/invoices/details/flows";
import { RemovePaymentDialog } from "@/components/invoices/details/remove-payment-dialog";
import type { InvoiceRef } from "@/components/invoices/invoice-actions";
import {
    DeleteDraftDialog,
    IssueDialog,
} from "@/components/invoices/invoice-actions";
import { useInvoiceSend } from "@/components/invoices/send-dialog";
import { NewLinkConfirm } from "@/components/invoices/unseen-link";
import { useWriteAgain } from "@/components/invoices/use-write-again";
import { useBusinessDetailsStep } from "@/components/organizations/use-business-details-step";
import { QrButton } from "@/components/qr/qr-button";
import type { ConfirmResult } from "@/components/shared/confirm-dialog";
import { ConfirmDialog, sayRefusal } from "@/components/shared/confirm-dialog";
import { runAction } from "@/lib/api/run-action";
import { formatMoneyMajor } from "@/lib/format/money";
import type { InvoiceActions } from "@/lib/invoices/detail-actions";
import { actionsFor } from "@/lib/invoices/detail-actions";
import type { InvoiceDetails } from "@/lib/invoices/details";
import {
    newPayLink,
    newViewLink,
    shareWithLink,
} from "@/lib/invoices/link-actions";
import { invoiceHref } from "@/lib/invoices/links";
import { mintedLink } from "@/lib/invoices/minted-links";
import { downloadInvoicePdf } from "@/lib/invoices/pdf";
import { paymentTargetOf } from "@/lib/invoices/record-payment";
import { canSend, paysOnline } from "@/lib/invoices/send";
import type { InvoicePayment } from "@/lib/invoices/service";
import { billedTo } from "@/lib/invoices/status";
import { invoiceZone } from "@/lib/invoices/zone";

type Open = "issue" | "delete" | "newLink" | "newViewLink" | null;
type PaymentDialog = "remove" | "cleared" | "bounced";

/**
 * Everything the details' buttons do (DEC-173, U9 #1121), for the page and
 * the side sheet alike, so the two can't differ: the rules (`actionsFor`)
 * say which buttons a state has; this maps each to its flow, and every flow
 * opens over the details and comes back to them.
 *
 * Kept from today's page (§15): issue (with the business-details and
 * GST-rate steps), issue and send, send and remind (held ten seconds with
 * Undo), the payment or view link (shown in place, copied again, made
 * anew with the one confirm), Print, Download PDF, Delete draft, cancel and
 * Refund…. New: the cheque's two endings and removing a payment.
 *
 * `onChanged` reads the details again after a write; `onGone` is a deleted
 * draft (the sheet closes; the page goes back to the list).
 */
export function useDetailsActions({
    details,
    onChanged,
    onGone,
    print,
}: {
    details: InvoiceDetails;
    onChanged: () => void;
    onGone?: () => void;
    /** Prints the paper, and only the paper. */
    print: () => void;
}): {
    actions: InvoiceActions;
    does: ActionDoes;
    /** The payment or view link made here, to copy again; null if none. */
    linkBox: ReactNode;
    payOnline: boolean;
    sendable: boolean;
    charging: { at: string } | null;
    /** "Remove this payment", from the payment's own line in the history. */
    removePayment: (payment: InvoicePayment) => void;
    overlays: ReactNode;
} {
    const { invoice: i, can, registered } = details;
    const who = billedTo(i).name;
    const ref: InvoiceRef = {
        id: i.id,
        number: i.number,
        standing: i.standing,
        who,
        total: formatMoneyMajor(i.total, i.currency),
    };
    const [open, setOpen] = useState<Open>(null);
    const [payment, setPayment] = useState<{
        dialog: PaymentDialog;
        payment: InvoicePayment;
    } | null>(null);
    const [busy, setBusy] = useState(false);
    const [downloading, setDownloading] = useState(false);
    // A receipt being emailed: a second tap sends nothing (review #13).
    const [receiptBusy, setReceiptBusy] = useState(false);
    const receiptGoing = useRef(false);
    // A view link just made (#833): shown until something replaces it.
    const [viewUrl, setViewUrl] = useState<string | null>(null);
    // A payment link is kept outside React (UX-048); this redraws once it is.
    const [, redraw] = useReducer((n: number) => n + 1, 0);
    // A payment link waits for the registered address (DEC-068).
    const detailsStep = useBusinessDetailsStep({
        then: "make its payment link",
        continueLabel: "Save and make link",
    });

    const payOnline = paysOnline(i.send, i.online);
    const sendable = can.write && canSend(i.send);
    const owed =
        (i.standing === "ISSUED" || i.standing === "OVERDUE") &&
        i.kind !== "CREDIT_NOTE" &&
        !i.order;
    const charging = owed ? (i.online?.autopayCharge ?? null) : null;
    const sending = useInvoiceSend({
        invoice: ref,
        send: sendable ? (i.send ?? null) : null,
        onSent: () => setViewUrl(null),
        onDone: onChanged,
    });
    const share = useShareFlow({ details, onDone: onChanged, print });
    const record = useRecordPaymentFlow({
        invoice: ref,
        target: paymentTargetOf(i, who),
        onDone: onChanged,
        onShareReceipt: () => share.open("RECEIPT", "whatsapp"),
    });
    const cancel = useCancelFlow({
        invoice: ref,
        target: cancelTargetOf(i),
        onDone: onChanged,
        registered,
    });
    const writing = useWriteAgain();

    // A payment link made for it earlier in this tab, shown again (UX-048).
    const payUrl = mintedLink(i.id, {
        standing: i.standing,
        updatedAt: i.updatedAt,
        payLinkMadeAt: i.online?.payLinkMadeAt,
    });
    const url = viewUrl ?? payUrl;
    const urlKind: "pay" | "view" = viewUrl ? "view" : "pay";
    const linkUnseen = !!i.online?.payLinkActive && !(payUrl && !viewUrl);

    const actions = actionsFor(i, can, {
        emailConnected: i.send?.reason !== "NO_EMAIL_PROVIDER",
        linkBusy: busy,
        pdfBusy: downloading,
        receiptBusy,
        linkUnseen,
    });

    async function makeLink(): Promise<ConfirmResult> {
        const res = await runAction(
            () => detailsStep.run(() => newPayLink(i.id, i.updatedAt)),
            { setBusy },
        );
        if (!res) return;
        if (!res.ok) return refusedResult(res);
        setViewUrl(null);
        redraw();
        showSuccess(
            (await copyText(res.data.url))
                ? `Payment link copied. Send it to ${who}.`
                : "Payment link ready. Copy it from under the money.",
        );
    }

    async function makeViewLink(): Promise<ConfirmResult> {
        const res = await runAction(
            () => detailsStep.run(() => newViewLink(i.id)),
            { setBusy },
        );
        if (!res) return;
        if (!res.ok) return refusedResult(res);
        setViewUrl(res.data.url);
        showSuccess(
            (await copyText(res.data.url))
                ? i.standing === "PAID"
                    ? `Link copied. Send it to ${who}: it shows the invoice, paid.`
                    : `Link copied. Send it to ${who}: it shows the invoice and how to pay you.`
                : "Link ready. Copy it from under the money.",
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

    async function downloadPdf() {
        const res = await runAction(() => downloadInvoicePdf(i), {
            setBusy: setDownloading,
        });
        if (!res) return;
        if (!res.ok) showError(res.error);
    }

    async function emailReceipt() {
        // The ref, not the state: two taps in one frame both see busy false.
        if (receiptGoing.current) return;
        receiptGoing.current = true;
        const res = await runAction(
            () => shareWithLink(i.id, { channel: "EMAIL", kind: "RECEIPT" }),
            {
                setBusy: (on) => {
                    receiptGoing.current = on;
                    setReceiptBusy(on);
                },
            },
        );
        if (!res) return;
        if (!res.ok) return showError(res.error);
        onChanged();
        showSuccess(
            res.data.email
                ? `Receipt emailed to ${res.data.email.to}.`
                : "Receipt sent.",
        );
    }

    const onPayment =
        (dialog: PaymentDialog) => (a: { paymentId?: string }) => {
            const p = i.payments?.find((x) => x.id === a.paymentId);
            if (p) setPayment({ dialog, payment: p });
        };

    const does: ActionDoes = {
        issueAndShare: () => (sendable ? sending.askDraft() : setOpen("issue")),
        issue: () => setOpen("issue"),
        delete: () => setOpen("delete"),
        recordPayment: () => record.open(),
        whatsapp: (a) => share.open(a.kind ?? "NEW", "whatsapp"),
        shareReceipt: () => share.open("RECEIPT"),
        send: () => sending.start(false),
        // One a day: the reason says when it is off.
        remind: () => sending.start(true),
        emailReceipt: () => void emailReceipt(),
        copyLink: () => {
            if (payUrl && !viewUrl) return copyShown();
            if (i.online?.payLinkActive) setOpen("newLink");
            else void makeLink().then(sayRefusal);
        },
        copyViewLink: () => {
            if (viewUrl) return copyShown();
            if (i.online?.payLinkActive) setOpen("newViewLink");
            else void makeViewLink().then(sayRefusal);
        },
        newLink: () => setOpen(payOnline ? "newLink" : "newViewLink"),
        pdf: () => void downloadPdf(),
        print,
        cancel: () => cancel.open(false),
        refund: () => cancel.open(true),
        markCleared: onPayment("cleared"),
        markBounced: onPayment("bounced"),
        removePayment: onPayment("remove"),
        // A void invoice nobody wrote again: a draft with its lines (U13).
        writeAgain: () => void writing.run(i),
        hrefs: {
            edit: `${invoiceHref(i.id)}/edit`,
            ...(i.order
                ? {
                      refundOrder: `/commerce/orders/${encodeURIComponent(i.order.id)}`,
                  }
                : {}),
        },
    };

    const linkBox = url ? (
        <div className="flex min-w-0 items-center gap-2" data-link-box>
            <code className="min-w-0 flex-1 select-all break-all rounded-[7px] bg-muted px-[9px] py-[7px] font-mono text-[12px]">
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

    const dialog = (d: Exclude<Open, null>) => (v: boolean) =>
        setOpen(v ? d : null);
    const paymentFor = (d: PaymentDialog) =>
        payment?.dialog === d ? payment.payment : null;
    const closePayment = () => setPayment(null);
    const timeZone = invoiceZone(details.business);

    const overlays = (
        <>
            {detailsStep.step}
            {sending.overlays}
            {record.overlays}
            {share.overlays}
            {cancel.overlays}
            <IssueDialog
                open={open === "issue"}
                onOpenChange={dialog("issue")}
                invoice={ref}
                canSend={sendable}
                payOnline={payOnline}
                onDone={onChanged}
            />
            <DeleteDraftDialog
                open={open === "delete"}
                onOpenChange={dialog("delete")}
                invoice={ref}
                onDeleted={onGone}
            />
            <NewLinkConfirm
                open={open === "newLink"}
                onOpenChange={dialog("newLink")}
                who={who}
                onConfirm={makeLink}
            />
            <ConfirmDialog
                open={open === "newViewLink"}
                onOpenChange={dialog("newViewLink")}
                tone="neutral"
                icon={Link2}
                title="Make a new link?"
                description={`The link you shared before stops working straight away. Send ${who} the new one. This cannot be undone.`}
                confirmLabel="Make a new link"
                keepLabel="Keep the old link"
                onConfirm={makeViewLink}
            />
            <RemovePaymentDialog
                invoice={i}
                payment={paymentFor("remove")}
                timeZone={timeZone}
                onClose={closePayment}
                onChanged={onChanged}
            />
            <ChequeClearedDialog
                invoice={i}
                payment={paymentFor("cleared")}
                who={who}
                emailsReceipt={i.send?.reason !== "NO_EMAIL_PROVIDER"}
                onClose={closePayment}
                onChanged={onChanged}
            />
            <ChequeBouncedDialog
                invoice={i}
                payment={paymentFor("bounced")}
                who={who}
                timeZone={timeZone}
                onClose={closePayment}
                onChanged={onChanged}
            />
        </>
    );

    return {
        actions,
        does,
        linkBox,
        payOnline,
        sendable,
        charging,
        removePayment: (p) => setPayment({ dialog: "remove", payment: p }),
        overlays,
    };
}

"use client";

import { copyFailedMessage, copyText } from "@saroh/ui/copy-button";
import { showError, showSuccess } from "@saroh/ui/toast";
import type { ReactNode } from "react";
import { useState } from "react";

import type { CancelOrCorrectInvoice } from "@/components/invoices/cancel-or-correct-sheet";
import { CancelOrCorrectSheet } from "@/components/invoices/cancel-or-correct-sheet";
import type { InvoiceRef } from "@/components/invoices/invoice-actions";
import {
    RecordPaymentDialog,
    RefundInvoiceDialog,
} from "@/components/invoices/invoice-actions";
import type { ShareMessageKind } from "@/lib/invoices/detail-actions";
import { shareWithLink } from "@/lib/invoices/link-actions";

/*
 * The seams the details view opens other units' flows through (DEC-173,
 * U9 #1121). Each is a hook with one shape — `open(…)` and the `overlays`
 * to render once — so Record payment (U10), Share (U11) and Cancel or
 * correct (U13) replace the body of their own hook here and nothing in the
 * view changes. Until they land, each opens today's flow.
 *
 * Every flow opens over the details and comes back to them: `onDone` is
 * called after a write, and the details read themselves again.
 */

export interface FlowProps {
    invoice: InvoiceRef;
    /** Something was written: the details read themselves again. */
    onDone: () => void;
}

export interface Flow<A extends unknown[] = []> {
    open: (...args: A) => void;
    /** Render once, beside the view. */
    overlays: ReactNode;
}

/**
 * Record payment (U10 #1122 replaces this with its sheet: amounts, part
 * payments, cheques, Undo). Today: the four-field sheet.
 */
export function useRecordPaymentFlow({ invoice, onDone }: FlowProps): Flow {
    const [open, setOpen] = useState(false);
    return {
        open: () => setOpen(true),
        overlays: (
            <RecordPaymentDialog
                open={open}
                onOpenChange={setOpen}
                invoice={invoice}
                onDone={onDone}
            />
        ),
    };
}

/**
 * Share on WhatsApp (U11 #1123 replaces this with its sheet, which also
 * asks for a number when there is none). Today: the API mints a fresh link
 * and writes the message (DEC-173), and WhatsApp opens with it filled in;
 * Saroh sends nothing. With no phone on the invoice, the message is copied
 * to paste in WhatsApp.
 */
export function useShareFlow({
    invoice,
    onDone,
}: FlowProps): Flow<[kind: ShareMessageKind]> {
    async function share(kind: ShareMessageKind) {
        // Opened inside the press, so no popup blocker stops it; pointed
        // at WhatsApp once the message is back.
        const tab =
            typeof window === "undefined"
                ? null
                : window.open("about:blank", "_blank");
        const res = await shareWithLink(invoice.id, {
            channel: "WHATSAPP",
            kind,
        });
        if (!res.ok) {
            tab?.close();
            showError(res.error);
            return;
        }
        onDone();
        const { whatsappUrl, text } = res.data;
        if (whatsappUrl && tab) {
            tab.opener = null;
            tab.location.href = whatsappUrl;
            return;
        }
        tab?.close();
        if (text && (await copyText(text))) {
            showSuccess(
                `Message copied. Paste it in WhatsApp to ${invoice.who}.`,
                "There's no phone number on this invoice, so WhatsApp couldn't open on their chat.",
            );
        } else showError(copyFailedMessage());
    }
    return { open: (kind) => void share(kind), overlays: null };
}

/**
 * Cancel or correct (U13 #1125: variant A, a sheet), and Refund… (a paid
 * invoice's credit note). Both come back to the details.
 */
export function useCancelFlow({
    invoice,
    target,
    onDone,
    registered,
}: FlowProps & {
    /** What the cancel sheet reads (`cancelTargetOf`). */
    target: CancelOrCorrectInvoice;
    registered: boolean;
}): Flow<[refund?: boolean]> {
    const [open, setOpen] = useState<"cancel" | "refund" | null>(null);
    const to = (v: "cancel" | "refund") => (o: boolean) =>
        setOpen(o ? v : null);
    return {
        open: (refund) => setOpen(refund ? "refund" : "cancel"),
        overlays: (
            <>
                <CancelOrCorrectSheet
                    open={open === "cancel"}
                    onOpenChange={to("cancel")}
                    invoice={target}
                    registered={registered}
                    onDone={() => onDone()}
                />
                <RefundInvoiceDialog
                    open={open === "refund"}
                    onOpenChange={to("refund")}
                    invoice={invoice}
                    onDone={onDone}
                />
            </>
        ),
    };
}

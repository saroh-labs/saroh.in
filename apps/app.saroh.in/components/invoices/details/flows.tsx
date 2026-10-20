"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

import type { CancelOrCorrectInvoice } from "@/components/invoices/cancel-or-correct-sheet";
import { CancelOrCorrectSheet } from "@/components/invoices/cancel-or-correct-sheet";
import type { InvoiceRef } from "@/components/invoices/invoice-actions";
import { RefundInvoiceDialog } from "@/components/invoices/invoice-actions";
import { RecordPaymentSheet } from "@/components/invoices/record-payment-sheet";
import { ShareSheet } from "@/components/invoices/share-sheet";
import type { ShareMessageKind } from "@/lib/invoices/detail-actions";
import type { InvoiceDetails } from "@/lib/invoices/details";
import type { PaymentTarget } from "@/lib/invoices/record-payment";
import type { ShareTab } from "@/lib/invoices/share";
import { invoiceZone } from "@/lib/invoices/zone";

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
 * Record payment (U10 #1122): the sheet with all of what is left or part
 * of it, cheques, Undo and the receipt. It gets the invoice's figures
 * (`paymentTargetOf`) so it opens without a read. A cheque's in the bank
 * and bounced, and Remove payment, are the details' own dialogs
 * (`cheque-dialogs.tsx`, `remove-payment-dialog.tsx`).
 */
export function useRecordPaymentFlow({
    invoice,
    target,
    onDone,
    onShareReceipt,
}: FlowProps & {
    /** What is left and where the receipt goes; else read on opening. */
    target?: PaymentTarget;
    /** "Share receipt on WhatsApp": the share sheet on the receipt (U11). */
    onShareReceipt?: () => void;
}): Flow {
    const [open, setOpen] = useState(false);
    return {
        open: () => setOpen(true),
        overlays: (
            <RecordPaymentSheet
                open={open}
                onOpenChange={setOpen}
                invoice={target ?? { id: invoice.id, who: invoice.who }}
                onRecorded={() => onDone()}
                onShareReceipt={onShareReceipt}
            />
        ),
    };
}

/**
 * Share (U11 #1123): one sheet with WhatsApp, Email, Link and PDF, opened on
 * the message and tab asked for. WhatsApp is click-to-chat: the API writes
 * the message and makes a fresh link (DEC-173), and WhatsApp opens on this
 * device with it filled in; Saroh sends nothing. With no number on the
 * invoice the sheet asks for one. Record payment (U10) opens it too, for
 * "Share receipt on WhatsApp".
 */
export function useShareFlow({
    details,
    onDone,
    print,
}: {
    details: InvoiceDetails;
    onDone: () => void;
    /** Prints the paper, and only the paper. */
    print?: () => void;
}): Flow<[kind?: ShareMessageKind, tab?: ShareTab]> {
    const [at, setAt] = useState<{
        kind?: ShareMessageKind;
        tab?: ShareTab;
    } | null>(null);
    const [open, setOpen] = useState(false);
    return {
        open: (kind, tab) => {
            setAt({ kind, tab });
            setOpen(true);
        },
        overlays: (
            <ShareSheet
                open={open}
                onOpenChange={setOpen}
                invoice={details.invoice}
                kind={at?.kind}
                tab={at?.tab}
                business={details.businessName}
                can={details.can}
                timeZone={invoiceZone(details.business)}
                emailNote={details.emailNote}
                onPrint={print}
                onDone={onDone}
            />
        ),
    };
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
    const router = useRouter();
    return {
        open: (refund) => setOpen(refund ? "refund" : "cancel"),
        overlays: (
            <>
                <CancelOrCorrectSheet
                    open={open === "cancel"}
                    onOpenChange={to("cancel")}
                    invoice={target}
                    registered={registered}
                    // A corrected draft opens in the editor, as its toast
                    // says; anything else comes back to the details.
                    onDone={(outcome) =>
                        outcome.kind === "draft"
                            ? router.push(
                                  `/billing/invoices/${outcome.draftId}/edit`,
                              )
                            : onDone()
                    }
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

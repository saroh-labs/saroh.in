"use client";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@saroh/ui/alert-dialog";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { InvoiceRef } from "@/components/invoices/invoice-actions";
import {
    issueInvoice,
    remindInvoice,
    sendInvoice,
} from "@/lib/invoices/actions";
import { sendConfirmLine, sendOutcome } from "@/lib/invoices/send";
import type { InvoiceSend } from "@/lib/invoices/service";

/**
 * Send an invoice with its pay link, or a reminder (D17). It says who is
 * told, where, and that a link shared before stops working, before it
 * happens. From a draft, "Send with pay link" issues it first, as the
 * design's draft action does: it takes its number, then goes.
 */
export function SendDialog({
    open,
    onOpenChange,
    invoice,
    send,
    mode,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoice: InvoiceRef;
    send: InvoiceSend;
    /** "draft" issues it first; "reminder" sends reminder words. */
    mode: "send" | "reminder" | "draft";
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const first = invoice.who.split(" ")[0] || invoice.who;
    const reminder = mode === "reminder";
    const label = invoice.number ?? "this invoice";

    async function go() {
        setBusy(true);
        let number = invoice.number;
        if (mode === "draft") {
            const issued = await issueInvoice(invoice.id);
            if (!issued.ok) {
                setBusy(false);
                return showError(issued.error);
            }
            number = issued.data.number ?? number;
        }
        const res = reminder
            ? await remindInvoice(invoice.id)
            : await sendInvoice(invoice.id);
        setBusy(false);
        onOpenChange(false);
        router.refresh();
        if (!res.ok) {
            return showError(
                mode === "draft"
                    ? `${number ?? "It"} issued, but not sent: ${res.error}`
                    : res.error,
            );
        }
        const out = sendOutcome(res.data, first, reminder);
        if (out.ok) showSuccess(out.message);
        else showError(out.message);
    }

    const title = reminder
        ? `Remind ${first} about ${label}?`
        : `Send ${invoice.total} to ${invoice.who}?`;
    const action = reminder ? "Send reminder" : "Send it";

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="max-w-[420px]">
                <AlertDialogHeader>
                    <AlertDialogTitle className="font-display text-[17px] tracking-[-0.02em]">
                        {title}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {mode === "draft"
                            ? "It takes the next number and its lines lock. "
                            : ""}
                        {sendConfirmLine(send, first, invoice.total, reminder)}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Not now</AlertDialogCancel>
                    <AlertDialogAction
                        disabled={busy}
                        onClick={(e) => {
                            e.preventDefault();
                            void go();
                        }}
                    >
                        {busy ? "Sending…" : action}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

"use client";

import { showError, showSuccess } from "@saroh/ui/toast";
import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

import { useGstRateStep } from "@/components/gst-rates/use-gst-rate-step";
import type { InvoiceRef } from "@/components/invoices/invoice-actions";
import { useBusinessDetailsStep } from "@/components/organizations/use-business-details-step";
import type { ConfirmResult } from "@/components/shared/confirm-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { HeldResult } from "@/components/shared/use-hold";
import { useHold } from "@/components/shared/use-hold";
import { issueInvoice, setInvoiceLineRates } from "@/lib/invoices/actions";
import { remindWithLink, sendWithLink } from "@/lib/invoices/link-actions";
import { sendConfirmLine, sendOutcome } from "@/lib/invoices/send";
import type { InvoiceSend } from "@/lib/invoices/service";

/**
 * Sending an invoice with its payment link, or a reminder (D17).
 *
 * A send tells a customer, so it asks nothing and waits ten seconds with
 * Undo (`useHold`), as Home's reminder does: the toast says who is told
 * and where, and nothing goes until the hold ends.
 *
 * From a draft, "Send with payment link" issues it first, and issuing can't be
 * undone: it takes its number and its lines lock. So a draft is asked
 * once, in the one confirm (`draftConfirm`), and then issued and sent.
 *
 * Without online payment (`send.payOnline` false, DEC-070) the link only
 * shows the invoice, and the words say so: no payment link is promised.
 */
export function useInvoiceSend({
    invoice,
    send,
    onSent,
}: {
    invoice: InvoiceRef;
    /** How it can be sent; null when it can't, and nothing is offered. */
    send: InvoiceSend | null;
    /** It went: the link shown before is dead, so the screen drops it. */
    onSent?: () => void;
}): {
    /** Send it, or send a reminder: held ten seconds with Undo. */
    start: (reminder: boolean) => void;
    /** A draft: ask once, then issue and send. */
    askDraft: () => void;
    /** The draft's confirm and the steps it may open. Render once. */
    overlays: ReactNode;
} {
    const router = useRouter();
    const { send: hold } = useHold();
    const [asking, setAsking] = useState(false);
    const first = invoice.who.split(" ")[0] || invoice.who;
    // No registered address yet (DEC-068): asked here, then it goes.
    const details = useBusinessDetailsStep({
        then: "send it",
        continueLabel: "Save and send",
    });
    // A draft's line with no GST rate on a tax invoice: each is chosen
    // here and saved to the draft, then it is issued and sent.
    const rates = useGstRateStep({
        then: "issue and send this invoice",
        continueLabel: "Save and send",
        saveLines: (chosen) => setInvoiceLineRates(invoice.id, chosen),
    });

    /** Send it now; what was said comes back for whoever asked. */
    async function deliver(
        reminder: boolean,
    ): Promise<{ ok: true; message: string } | (HeldResult & { ok: false })> {
        if (!send) return { ok: false, error: "", said: true };
        const res = await details.run(() =>
            reminder ? remindWithLink(invoice.id) : sendWithLink(invoice.id),
        );
        // The details sheet was closed without saving: nothing was sent.
        if (!res) return { ok: false, error: "", said: true };
        router.refresh();
        if (!res.ok) return { ok: false, error: res.error };
        onSent?.();
        const out = sendOutcome(
            res.data,
            first,
            reminder,
            send.payOnline ?? true,
        );
        return out.ok
            ? { ok: true, message: out.message }
            : { ok: false, error: out.message };
    }

    function start(reminder: boolean) {
        if (!send) return;
        let said = `Sent to ${first}.`;
        hold(`invoice-send:${invoice.id}`, {
            description: sendConfirmLine(send, first, invoice.total, reminder),
            run: async () => {
                const res = await deliver(reminder);
                if (res.ok) said = res.message;
                return res;
            },
            sent: () => said,
        });
    }

    async function issueAndSend(): Promise<ConfirmResult> {
        const issued = await rates.run(() =>
            details.run(() => issueInvoice(invoice.id)),
        );
        // A sheet was closed without saving: still a draft, nothing sent.
        if (!issued) return true;
        if (!issued.ok) return { ok: false, error: issued.error };
        const number = issued.data.number ?? invoice.number;
        const res = await deliver(false);
        router.refresh();
        if (res.ok) showSuccess(res.message);
        else if (!res.said) {
            // Issued, so the confirm is done: what didn't go is said.
            showError(`${number ?? "It"} issued, but not sent.`, res.error);
        }
    }

    const overlays = (
        <>
            {send ? (
                <ConfirmDialog
                    open={asking}
                    onOpenChange={setAsking}
                    tone="neutral"
                    icon={Send}
                    title={`Issue and send ${invoice.total} to ${invoice.who}?`}
                    description={`It takes the next number and its lines lock. ${sendConfirmLine(send, first, invoice.total, false)} This cannot be undone.`}
                    confirmLabel="Issue and send"
                    busyLabel="Sending…"
                    keepLabel="Keep draft"
                    onConfirm={issueAndSend}
                />
            ) : null}
            {details.step}
            {rates.step}
        </>
    );

    return { start, askDraft: () => setAsking(true), overlays };
}

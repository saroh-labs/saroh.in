"use client";

import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { showError, showUndo } from "@saroh/ui/toast";
import { useState } from "react";

import { FormDialog } from "@/components/shared/form-dialog";
import { runAction } from "@/lib/api/run-action";
import { formatDate } from "@/lib/format/datetime";
import { formatMoneyMajor } from "@/lib/format/money";
import {
    chequeBounced,
    chequeCleared,
    recordPayment,
    removePayment,
} from "@/lib/invoices/actions";
import type {
    Invoice,
    InvoicePayment,
    InvoicePaymentMethod,
} from "@/lib/invoices/service";
import { leftCents } from "@/lib/invoices/status";
import { paymentWay, toCollect } from "@/lib/invoices/words";

/**
 * "Remove this payment" (DEC-173, U9 #1121): a payment recorded by mistake
 * comes off, with an optional why, and stays in the history struck
 * through. It can be put back by recording it again, so it asks nothing
 * more than the why and offers Undo, which records it again as it was (a
 * cheque already in the bank is marked so again, and a bounced one bounced
 * again, so Undo never brings back a live cheque the bank returned).
 */
export function RemovePaymentDialog({
    invoice,
    payment,
    timeZone,
    onClose,
    onChanged,
}: {
    invoice: Pick<Invoice, "id" | "number">;
    /** The payment being removed; null when closed. */
    payment: InvoicePayment | null;
    timeZone: string;
    onClose: () => void;
    /** It went, or Undo put it back: the details are read again. */
    onChanged: (fresh?: Invoice) => void;
}) {
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    // A fresh why for each payment it opens on.
    const [was, setWas] = useState(payment?.id ?? null);
    if ((payment?.id ?? null) !== was) {
        setWas(payment?.id ?? null);
        setReason("");
    }

    const p = payment;
    const money = p ? formatMoneyMajor(p.amount, p.currency) : "";

    async function remove() {
        if (!p) return;
        const res = await runAction(
            () => removePayment(invoice.id, p.id, reason.trim() || undefined),
            { setBusy },
        );
        if (!res) return;
        if (!res.ok) return showError(res.error);
        onClose();
        onChanged(res.data);
        const left = formatMoneyMajor(
            leftCents(res.data) / 100,
            res.data.currency,
        );
        showUndo(
            `Payment of ${money} removed.`,
            async () => {
                const back = await putBack(invoice.id, p);
                onChanged();
                return back;
            },
            {
                description: `${toCollect(left)} on ${invoice.number ?? "the invoice"}.`,
            },
        );
    }

    return (
        <FormDialog
            open={p !== null}
            size="sm"
            title="Remove this payment"
            description={
                p
                    ? `${money} by ${paymentWay(p.method)} on ${formatDate(p.receivedAt, timeZone)}. It stays in the history, struck through, and the invoice is owed it again.`
                    : ""
            }
            pending={busy}
            tone="destructive"
            saveLabel="Remove payment"
            savingLabel="Removing…"
            onClose={onClose}
            onSubmit={remove}
        >
            <Field label="Why" optional hint="Only you see this.">
                <Input
                    value={reason}
                    maxLength={500}
                    placeholder="Recorded by mistake"
                    onChange={(e) => setReason(e.target.value)}
                />
            </Field>
        </FormDialog>
    );
}

/** Record a removed payment again as it was: Undo's way back. */
export async function putBack(
    invoiceId: string,
    p: InvoicePayment,
): Promise<{ ok: boolean; error?: string }> {
    const res = await recordPayment(invoiceId, {
        // Only a payment recorded by hand can be removed, so never ONLINE.
        method: p.method as InvoicePaymentMethod,
        amount: p.amount,
        receivedAt: p.receivedAt,
        ...(p.reference ? { reference: p.reference } : {}),
        ...(p.note ? { note: p.note } : {}),
        ...(p.cheque?.number ? { chequeNumber: p.cheque.number } : {}),
        ...(p.cheque?.bank ? { chequeBank: p.cheque.bank } : {}),
    });
    if (!res.ok) return { ok: false, error: res.error };
    const again = res.data.recorded?.paymentId;
    if (!again) return { ok: true };
    // In the bank before: marked so again, also when it then bounced (#7).
    if (
        p.bankStatus === "CLEARED" ||
        (p.bankStatus === "BOUNCED" && p.clearedAt)
    ) {
        const cleared = await chequeCleared(
            invoiceId,
            again,
            p.clearedAt ?? undefined,
        );
        if (!cleared.ok) return { ok: false, error: cleared.error };
    }
    // A bounced cheque comes back bounced, never live and waiting (#10).
    if (p.bankStatus === "BOUNCED") {
        const bounced = await chequeBounced(invoiceId, again, {
            ...(p.bouncedAt ? { bouncedAt: p.bouncedAt } : {}),
            ...(p.bounceReason ? { reason: p.bounceReason } : {}),
        });
        if (!bounced.ok) return { ok: false, error: bounced.error };
    }
    return { ok: true };
}

"use client";

import { DatePicker } from "@saroh/ui/date-picker";
import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useState } from "react";

import { FormDialog } from "@/components/shared/form-dialog";
import { runAction } from "@/lib/api/run-action";
import { formatDate } from "@/lib/format/datetime";
import { formatMoneyMajor } from "@/lib/format/money";
import { chequeBounced, chequeCleared } from "@/lib/invoices/actions";
import type { Invoice, InvoicePayment } from "@/lib/invoices/service";

/**
 * A waiting cheque's two endings (DEC-173, INVRecordPlus): it is in the
 * bank, or it bounced. The details sheet and the page open these from the
 * cheque's own buttons, and they come back to the details.
 *
 * - In the bank: the day it cleared, then the invoice reads plain "Paid",
 *   and its receipt goes then (a cheque's receipt waits for the bank).
 * - Bounced: the API has no way back, so this is the one question, "Keep
 *   the payment" or "Mark as bounced", with an optional why. What it paid
 *   is owed again, and overdue once past its due date. No bounce charge.
 */

const chequeName = (p: InvoicePayment) =>
    p.cheque?.number ? `Cheque ${p.cheque.number}` : "The cheque";

export function ChequeClearedDialog({
    invoice,
    payment,
    who,
    emailsReceipt,
    onClose,
    onChanged,
}: {
    invoice: Pick<Invoice, "id">;
    /** The waiting cheque; null when closed. */
    payment: InvoicePayment | null;
    /** Who paid: "Vivek Nair". */
    who: string;
    /** The business emails receipts through its own provider. */
    emailsReceipt: boolean;
    onClose: () => void;
    onChanged: (fresh: Invoice) => void;
}) {
    const [on, setOn] = useState<Date | undefined>(new Date());
    const [busy, setBusy] = useState(false);
    const [was, setWas] = useState(payment?.id ?? null);
    if ((payment?.id ?? null) !== was) {
        setWas(payment?.id ?? null);
        setOn(new Date());
    }
    const p = payment;
    const first = who.split(" ")[0] || who;

    async function clear() {
        if (!p) return;
        const res = await runAction(
            () => chequeCleared(invoice.id, p.id, on?.toISOString()),
            { setBusy },
        );
        if (!res) return;
        if (!res.ok) return showError(res.error);
        onClose();
        onChanged(res.data);
        showSuccess(
            `${chequeName(p)} is in the bank.`,
            emailsReceipt
                ? `The invoice reads Paid. Its receipt goes to ${first} by email.`
                : "The invoice reads Paid.",
        );
    }

    return (
        <FormDialog
            open={p !== null}
            size="sm"
            title={p ? `${chequeName(p)} is in the bank` : ""}
            description={
                p
                    ? [
                          `${formatMoneyMajor(p.amount, p.currency)} from ${who}`,
                          p.cheque?.bank ?? null,
                      ]
                          .filter(Boolean)
                          .join(" · ")
                    : ""
            }
            pending={busy}
            saveLabel="Mark as in the bank"
            savingLabel="Marking…"
            onClose={onClose}
            onSubmit={clear}
        >
            <Field
                holdsData
                label="Date it cleared"
                hint={
                    emailsReceipt
                        ? `The invoice then reads “Paid”, and its receipt goes to ${first} by email.`
                        : `The invoice then reads “Paid”. Share the receipt with ${first} after.`
                }
            >
                <DatePicker
                    value={on}
                    onValueChange={setOn}
                    disabledDays={
                        p
                            ? [
                                  { after: new Date() },
                                  { before: new Date(p.receivedAt) },
                              ]
                            : { after: new Date() }
                    }
                    className="w-full"
                />
            </Field>
        </FormDialog>
    );
}

export function ChequeBouncedDialog({
    invoice,
    payment,
    who,
    timeZone,
    onClose,
    onChanged,
}: {
    invoice: Pick<Invoice, "id" | "number" | "dueAt">;
    payment: InvoicePayment | null;
    who: string;
    timeZone: string;
    onClose: () => void;
    onChanged: (fresh: Invoice) => void;
}) {
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [was, setWas] = useState(payment?.id ?? null);
    if ((payment?.id ?? null) !== was) {
        setWas(payment?.id ?? null);
        setReason("");
    }
    const p = payment;
    const money = p ? formatMoneyMajor(p.amount, p.currency) : "";
    // When it opened: past its due date, it reads overdue again.
    const [now] = useState(() => Date.now());
    const late =
        invoice.dueAt && Date.parse(invoice.dueAt) < now
            ? ` and shows as overdue (due ${formatDate(invoice.dueAt, timeZone)})`
            : "";

    async function bounce() {
        if (!p) return;
        const res = await runAction(
            () =>
                chequeBounced(invoice.id, p.id, {
                    ...(reason.trim() ? { reason: reason.trim() } : {}),
                }),
            { setBusy },
        );
        if (!res) return;
        if (!res.ok) return showError(res.error);
        onClose();
        onChanged(res.data);
        showSuccess(`${chequeName(p)} bounced.`, `${money} is owed again.`);
    }

    return (
        <FormDialog
            open={p !== null}
            size="sm"
            title={p ? `${chequeName(p)} bounced?` : ""}
            description={
                p
                    ? `This takes off the ${money} payment from ${who}. ${invoice.number ?? "The invoice"} is owed again${late}. This cannot be undone.`
                    : ""
            }
            pending={busy}
            tone="destructive"
            cancelLabel="Keep the payment"
            saveLabel="Mark as bounced"
            savingLabel="Marking…"
            onClose={onClose}
            onSubmit={bounce}
        >
            <Field label="Why" optional hint="Only you see this.">
                <Input
                    value={reason}
                    maxLength={500}
                    placeholder="Not enough money in the account"
                    onChange={(e) => setReason(e.target.value)}
                />
            </Field>
        </FormDialog>
    );
}

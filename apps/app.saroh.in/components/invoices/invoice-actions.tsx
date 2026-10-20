"use client";

import { DatePicker } from "@saroh/ui/date-picker";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess } from "@saroh/ui/toast";
import { FileCheck2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { useGstRateStep } from "@/components/gst-rates/use-gst-rate-step";
import { useBusinessDetailsStep } from "@/components/organizations/use-business-details-step";
import type { ConfirmResult } from "@/components/shared/confirm-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormDialog } from "@/components/shared/form-dialog";
import { FormSheet } from "@/components/shared/form-sheet";
import { runAction } from "@/lib/api/run-action";
import {
    creditInvoice,
    deleteInvoice,
    issueInvoice,
    recordPayment,
    setInvoiceLineRates,
} from "@/lib/invoices/actions";
import { sendLabel } from "@/lib/invoices/send";
import type { InvoiceStanding, PaymentMethod } from "@/lib/invoices/service";
import { RECORD_PAYMENT } from "@/lib/invoices/words";
import { PAID_HOW } from "@/lib/orders/paid-how";
import { OptionSelect } from "@saroh/ui/option-select";

// The ways an order's Record as paid offers too (#834).
const METHODS = PAID_HOW;

export interface InvoiceRef {
    id: string;
    number: string | null;
    standing: InvoiceStanding;
    /** Who it's for, for the confirmations. */
    who: string;
    /** "₹2,400.00", for the confirmations. */
    total: string;
}

/**
 * Issue a draft: it takes the next number in the series and its lines lock.
 * Issuing never sends it, and the dialog says so: where the business can
 * send (D17), "Send with payment link" (or "Send invoice", DEC-070) does both;
 * where it can't, Saroh doesn't send it at all.
 */
export function IssueDialog({
    open,
    onOpenChange,
    invoice,
    canSend = false,
    payOnline = true,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoice: InvoiceRef;
    /** The business can send it (D17), so the copy names Send. */
    canSend?: boolean;
    /** Its link takes payment (`payOnline`), so there is a payment link to copy. */
    payOnline?: boolean;
}) {
    const router = useRouter();
    // No registered address yet (DEC-068): asked here, then it issues.
    const details = useBusinessDetailsStep({
        then: "issue it",
        continueLabel: "Save and issue",
    });

    // A line with no GST rate on a tax invoice: each is chosen here and
    // saved to the draft, then it issues.
    const rates = useGstRateStep({
        then: "issue this invoice",
        continueLabel: "Save and issue",
        saveLines: (chosen) => setInvoiceLineRates(invoice.id, chosen),
    });

    async function issue(): Promise<ConfirmResult> {
        const res = await rates.run(() =>
            details.run(() => issueInvoice(invoice.id)),
        );
        // A sheet was closed without saving: still a draft.
        if (!res) return true;
        if (!res.ok) return { ok: false, error: res.error };
        showSuccess(`${res.data.number ?? "Invoice"} issued.`);
        router.refresh();
    }

    return (
        <>
            <ConfirmDialog
                open={open}
                onOpenChange={onOpenChange}
                tone="neutral"
                icon={FileCheck2}
                title={`Issue ${invoice.total} to ${invoice.who}?`}
                description={`It takes the next number and its lines lock. A mistake after this is corrected with a credit note. ${
                    canSend
                        ? `Issuing doesn't send it: ${sendLabel(payOnline)} issues and sends in one step.`
                        : payOnline
                          ? "Saroh doesn't send it: copy its payment link or print it and hand it over."
                          : "Saroh doesn't send it: print it or download the PDF and hand it over."
                } This cannot be undone.`}
                confirmLabel="Issue invoice"
                busyLabel="Issuing…"
                keepLabel="Keep draft"
                onConfirm={issue}
            />
            {details.step}
            {rates.step}
        </>
    );
}

/** Delete a draft. It never had a number, so no number is skipped. */
export function DeleteDraftDialog({
    open,
    onOpenChange,
    invoice,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoice: InvoiceRef;
}) {
    const router = useRouter();

    async function remove(): Promise<ConfirmResult> {
        const res = await deleteInvoice(invoice.id);
        if (!res.ok) return { ok: false, error: res.error };
        showSuccess("Draft deleted.");
        router.push("/billing/invoices");
    }

    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Delete this draft?"
            description={`The draft for ${invoice.who} goes, lines and all. It never had a number, so nothing is skipped. This cannot be undone.`}
            confirmLabel="Delete draft"
            keepLabel="Keep draft"
            onConfirm={remove}
        />
    );
}

/**
 * Record money already taken: at the counter, by UPI, by bank transfer.
 * A side sheet (four fields): how it was paid, a reference, the day, a
 * note. Nothing is charged and nobody is contacted, and the sheet says so.
 */
export function RecordPaymentDialog({
    open,
    onOpenChange,
    invoice,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoice: InvoiceRef;
}) {
    const router = useRouter();
    const ids = { method: useId(), ref: useId(), on: useId(), note: useId() };
    const [method, setMethod] = useState<PaymentMethod>("UPI");
    const [reference, setReference] = useState("");
    const [paidOn, setPaidOn] = useState<Date | undefined>(new Date());
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);

    // The dialog stays mounted, so each opening starts fresh: paid today,
    // not on the day the page was loaded.
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            setMethod("UPI");
            setReference("");
            setPaidOn(new Date());
            setNote("");
        }
    }

    async function save() {
        const res = await runAction(
            () =>
                recordPayment(invoice.id, {
                    method,
                    ...(reference.trim()
                        ? { reference: reference.trim() }
                        : {}),
                    ...(note.trim() ? { note: note.trim() } : {}),
                    ...(paidOn ? { paidAt: paidOn.toISOString() } : {}),
                }),
            { setBusy },
        );
        if (!res) return;
        if (!res.ok) return showError(res.error);
        showSuccess(`Payment recorded on ${invoice.number ?? "the invoice"}.`);
        onOpenChange(false);
        router.refresh();
    }

    return (
        <FormSheet
            open={open}
            title={RECORD_PAYMENT}
            description={`${invoice.number ?? "Invoice"} · ${invoice.total} from ${invoice.who}`}
            pending={busy}
            saveLabel="Record payment"
            savingLabel="Recording…"
            fieldsClassName="gap-4"
            footNote={
                <p className="text-[12.5px] leading-[1.55] text-muted-foreground">
                    This records money you have already taken. Nothing is
                    charged and nobody is contacted.
                </p>
            }
            onClose={() => onOpenChange(false)}
            onSubmit={save}
        >
            <div className="grid gap-1.5">
                <Label htmlFor={ids.method}>How it was paid</Label>
                <OptionSelect
                    id={ids.method}
                    value={method}
                    onValueChange={(v) => setMethod(v)}
                    options={METHODS}
                />
            </div>
            <div className="grid gap-1.5">
                <Label htmlFor={ids.ref}>
                    Reference{" "}
                    <span className="font-normal text-muted-foreground">
                        (optional)
                    </span>
                </Label>
                <Input
                    id={ids.ref}
                    value={reference}
                    maxLength={120}
                    placeholder="A UPI or bank reference"
                    onChange={(e) => setReference(e.target.value)}
                />
            </div>
            <div className="grid gap-1.5">
                <Label htmlFor={ids.on}>Paid on</Label>
                <DatePicker
                    id={ids.on}
                    value={paidOn}
                    onValueChange={setPaidOn}
                    disabledDays={{ after: new Date() }}
                    className="w-full"
                />
            </div>
            <div className="grid gap-1.5">
                <Label htmlFor={ids.note}>
                    Note{" "}
                    <span className="font-normal text-muted-foreground">
                        (optional)
                    </span>
                </Label>
                <Textarea
                    id={ids.note}
                    value={note}
                    maxLength={500}
                    rows={2}
                    onChange={(e) => setNote(e.target.value)}
                />
            </div>
        </FormSheet>
    );
}

/**
 * Refund a paid invoice that no order owns: a credit note for all of it
 * (ADR-008), exactly as the Cancel invoice dialog's refund always was. The
 * invoice keeps its number and lines and reads Cancelled; Saroh records the
 * credit note only, and the business pays the customer back itself. It
 * asks why, says it cannot be undone, and has one destructive button.
 *
 * An unpaid invoice is cancelled or corrected in `CancelOrCorrectSheet`
 * (DEC-173, U13). What a credit note on paid money does — refund or keep
 * as credit — is a decision still to come, so Refund… stays as it is.
 */
export function RefundInvoiceDialog({
    open,
    onOpenChange,
    invoice,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoice: InvoiceRef;
}) {
    const router = useRouter();
    const reasonId = useId();
    const [reason, setReason] = useState("");
    const [tried, setTried] = useState(false);
    const [busy, setBusy] = useState(false);
    const missing = tried && !reason.trim();

    async function run() {
        setTried(true);
        if (!reason.trim()) return;
        const res = await runAction(
            () => creditInvoice(invoice.id, reason.trim()),
            { setBusy },
        );
        if (!res) return;
        if (!res.ok) return showError(res.error);
        onOpenChange(false);
        setReason("");
        setTried(false);
        showSuccess(
            `${`${invoice.number ?? "Invoice"} cancelled with credit note ${res.data.number ?? ""}`.trim()}.`,
        );
        router.refresh();
    }

    return (
        <FormDialog
            open={open}
            size="md"
            title={`Refund ${invoice.number} with a credit note?`}
            description={`A credit note for ${invoice.total} cancels it. ${invoice.number} keeps its number and its lines, and nothing more is owed on it. This cannot be undone. Saroh records the credit note only. Pay ${invoice.who} back yourself.`}
            pending={busy}
            tone="destructive"
            cancelLabel="Keep invoice"
            saveLabel="Issue the credit note"
            savingLabel="Issuing the credit note…"
            onClose={() => {
                setTried(false);
                onOpenChange(false);
            }}
            onSubmit={run}
        >
            <div className="grid gap-1.5">
                <Label htmlFor={reasonId}>Why</Label>
                <Input
                    id={reasonId}
                    value={reason}
                    maxLength={500}
                    placeholder="Wrong amount, wrong person, returned…"
                    aria-invalid={missing || undefined}
                    aria-describedby={
                        missing ? `${reasonId}-problem` : undefined
                    }
                    onChange={(e) => setReason(e.target.value)}
                />
                {missing ? (
                    <p
                        id={`${reasonId}-problem`}
                        role="alert"
                        className="text-[12.5px] font-medium text-destructive-subtle-foreground"
                    >
                        Say why it is being cancelled.
                    </p>
                ) : null}
                <p className="text-[12px] text-muted-foreground">
                    Printed on the credit note.
                </p>
            </div>
        </FormDialog>
    );
}

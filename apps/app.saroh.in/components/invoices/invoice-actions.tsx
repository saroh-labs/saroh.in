"use client";

import { Button } from "@saroh/ui/button";
import { DatePicker } from "@saroh/ui/date-picker";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess } from "@saroh/ui/toast";
import { FileCheck2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { useBusinessDetailsStep } from "@/components/organizations/use-business-details-step";
import type { ConfirmResult } from "@/components/shared/confirm-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormDialog } from "@/components/shared/form-dialog";
import { FormSheet } from "@/components/shared/form-sheet";
import { OptionSelect } from "@/components/shared/option-select";
import {
    creditInvoice,
    deleteInvoice,
    issueInvoice,
    recordPayment,
    reissueInvoice,
    voidInvoice,
} from "@/lib/invoices/actions";
import { sendLabel } from "@/lib/invoices/send";
import type { InvoiceStanding, PaymentMethod } from "@/lib/invoices/service";
import { PAID_HOW } from "@/lib/orders/paid-how";

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
 * send (D17), "Send with pay link" (or "Send invoice", DEC-070) does both;
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
    /** Its link takes payment (`payOnline`), so there is a pay link to copy. */
    payOnline?: boolean;
}) {
    const router = useRouter();
    // No registered address yet (DEC-068): asked here, then it issues.
    const details = useBusinessDetailsStep({
        then: "issue it",
        continueLabel: "Save and issue",
    });

    async function issue(): Promise<ConfirmResult> {
        const res = await details.run(() => issueInvoice(invoice.id));
        // The details sheet was closed without saving: still a draft.
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
                          ? "Saroh doesn't send it: copy its pay link or print it and hand it over."
                          : "Saroh doesn't send it: print it or download the PDF and hand it over."
                } This cannot be undone.`}
                confirmLabel="Issue invoice"
                busyLabel="Issuing…"
                keepLabel="Keep draft"
                onConfirm={issue}
            />
            {details.step}
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
        setBusy(true);
        const res = await recordPayment(invoice.id, {
            method,
            ...(reference.trim() ? { reference: reference.trim() } : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
            ...(paidOn ? { paidAt: paidOn.toISOString() } : {}),
        });
        setBusy(false);
        if (!res.ok) return showError(res.error);
        showSuccess(`${invoice.number ?? "Invoice"} marked paid.`);
        onOpenChange(false);
        router.refresh();
    }

    return (
        <FormSheet
            open={open}
            title="Record a payment"
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
 * Cancel an issued invoice, or refund a paid one that no order owns.
 *
 * A GST-registered business never voids an issued invoice (ADR-008): it
 * issues a credit note for all of it, and the invoice keeps its number and
 * reads Cancelled. A business that is not registered voids it instead, and
 * may open a corrected draft in its place. Either way the dialog asks why
 * and says it cannot be undone; neither moves any money.
 */
export function CancelInvoiceDialog({
    open,
    onOpenChange,
    invoice,
    registered,
    refund = false,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoice: InvoiceRef;
    /** Its paper is a tax invoice: cancel by credit note, never void. */
    registered: boolean;
    /** A paid invoice being refunded, rather than an unpaid one cancelled. */
    refund?: boolean;
}) {
    const router = useRouter();
    const reasonId = useId();
    const [reason, setReason] = useState("");
    const [tried, setTried] = useState(false);
    const [busy, setBusy] = useState<"credit" | "void" | "reissue" | null>(
        null,
    );
    const byCredit = registered || refund;
    const missing = tried && !reason.trim();

    async function run(kind: "credit" | "void" | "reissue") {
        setTried(true);
        if (!reason.trim()) return;
        setBusy(kind);
        const res =
            kind === "credit"
                ? await creditInvoice(invoice.id, reason.trim())
                : kind === "void"
                  ? await voidInvoice(invoice.id, reason.trim())
                  : await reissueInvoice(invoice.id, reason.trim());
        setBusy(null);
        if (!res.ok) return showError(res.error);
        onOpenChange(false);
        setReason("");
        setTried(false);
        if (kind === "reissue") {
            showSuccess(
                `${invoice.number ?? "Invoice"} voided. A corrected draft is open.`,
            );
            router.push(`/billing/invoices/${res.data.id}/edit`);
            return;
        }
        showSuccess(
            kind === "credit"
                ? `${`${invoice.number ?? "Invoice"} cancelled with credit note ${res.data.number ?? ""}`.trim()}.`
                : `${invoice.number ?? "Invoice"} voided.`,
        );
        router.refresh();
    }

    return (
        <FormDialog
            open={open}
            size="md"
            title={
                refund
                    ? `Refund ${invoice.number} with a credit note?`
                    : `Cancel ${invoice.number}?`
            }
            description={`${
                byCredit
                    ? `A credit note for ${invoice.total} cancels it. ${invoice.number} keeps its number and its lines, and nothing more is owed on it. This cannot be undone.`
                    : `It keeps its number and stays in the list, marked void, so ${invoice.number} always means the same thing. This cannot be undone.`
            }${
                refund
                    ? ` Saroh records the credit note only. Pay ${invoice.who} back yourself.`
                    : ""
            }`}
            pending={busy !== null}
            tone="destructive"
            cancelLabel="Keep invoice"
            saveLabel={
                byCredit
                    ? refund
                        ? "Issue the credit note"
                        : "Cancel with a credit note"
                    : "Void and write again"
            }
            savingLabel={
                busy === "credit" ? "Issuing the credit note…" : "Voiding…"
            }
            extra={
                byCredit ? null : (
                    <Button
                        type="button"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() => void run("void")}
                    >
                        Void invoice
                    </Button>
                )
            }
            onClose={() => {
                setTried(false);
                onOpenChange(false);
            }}
            onSubmit={() => run(byCredit ? "credit" : "reissue")}
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
                        {byCredit
                            ? "Say why it is being cancelled."
                            : "Say why it is being voided."}
                    </p>
                ) : null}
                <p className="text-[12px] text-muted-foreground">
                    {byCredit
                        ? "Printed on the credit note."
                        : "Kept on the invoice, for whoever reads it later."}
                </p>
            </div>
        </FormDialog>
    );
}

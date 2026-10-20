"use client";

import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { showError, showSuccess } from "@saroh/ui/toast";
import { FileCheck2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { useGstRateStep } from "@/components/gst-rates/use-gst-rate-step";
import { useBusinessDetailsStep } from "@/components/organizations/use-business-details-step";
import type { ConfirmResult } from "@/components/shared/confirm-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormDialog } from "@/components/shared/form-dialog";
import { runAction } from "@/lib/api/run-action";
import {
    creditInvoice,
    deleteInvoice,
    issueInvoice,
    setInvoiceLineRates,
} from "@/lib/invoices/actions";
import { sendLabel } from "@/lib/invoices/send";
import type { CreditExpect, InvoiceStanding } from "@/lib/invoices/service";

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
    onDone,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoice: InvoiceRef;
    /** The business can send it (D17), so the copy names Send. */
    canSend?: boolean;
    /** Its link takes payment (`payOnline`), so there is a payment link to copy. */
    payOnline?: boolean;
    /** It was issued: the details sheet reads it again (U9). */
    onDone?: () => void;
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
        onDone?.();
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
    onDeleted,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoice: InvoiceRef;
    /**
     * It went. From the list's details sheet the list stays (U9): the
     * sheet closes and the row goes. Left out, back to the list.
     */
    onDeleted?: () => void;
}) {
    const router = useRouter();

    async function remove(): Promise<ConfirmResult> {
        const res = await deleteInvoice(invoice.id);
        if (!res.ok) return { ok: false, error: res.error };
        showSuccess("Draft deleted.");
        if (onDeleted) {
            onDeleted();
            router.refresh();
        } else router.push("/billing/invoices");
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
    expect,
    onDone,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoice: InvoiceRef;
    /** What the screen showed, checked again by the API (#2 review). */
    expect?: CreditExpect;
    /** It was refunded: the details sheet reads it again (U9). */
    onDone?: () => void;
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
            () => creditInvoice(invoice.id, reason.trim(), expect),
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
        onDone?.();
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

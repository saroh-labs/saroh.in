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
import { Button } from "@saroh/ui/button";
import { DatePicker } from "@saroh/ui/date-picker";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@saroh/ui/dialog";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { OptionSelect } from "@/components/shared/option-select";
import {
    creditInvoice,
    deleteInvoice,
    issueInvoice,
    recordPayment,
    reissueInvoice,
    voidInvoice,
} from "@/lib/invoices/actions";
import type { InvoiceStanding, PaymentMethod } from "@/lib/invoices/service";

const METHODS: { value: PaymentMethod; label: string }[] = [
    { value: "CASH", label: "Cash" },
    { value: "UPI", label: "UPI" },
    { value: "BANK_TRANSFER", label: "Bank transfer" },
    { value: "CARD", label: "Card at the counter" },
    { value: "OTHER", label: "Something else" },
];

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
 * Saroh doesn't send it, and the dialog says so.
 */
export function IssueDialog({
    open,
    onOpenChange,
    invoice,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoice: InvoiceRef;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    async function issue() {
        setBusy(true);
        const res = await issueInvoice(invoice.id);
        setBusy(false);
        if (!res.ok) return showError(res.error);
        showSuccess(`${res.data.number ?? "Invoice"} issued`);
        onOpenChange(false);
        router.refresh();
    }

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="max-w-[420px]">
                <AlertDialogHeader>
                    <AlertDialogTitle className="font-display text-[17px] tracking-[-0.02em]">
                        Issue {invoice.total} to {invoice.who}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        It takes the next number and its lines lock — a mistake
                        after this is corrected with a credit note. Saroh
                        doesn&apos;t send it: copy its pay link or print it and
                        hand it over.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Not yet</AlertDialogCancel>
                    <AlertDialogAction
                        disabled={busy}
                        onClick={(e) => {
                            e.preventDefault();
                            void issue();
                        }}
                    >
                        {busy ? "Issuing…" : "Issue it"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
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

    async function remove() {
        const res = await deleteInvoice(invoice.id);
        if (!res.ok) return showError(res.error);
        showSuccess("Draft deleted");
        router.push("/billing/invoices");
    }

    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Delete this draft?"
            description={`The draft for ${invoice.who} goes, lines and all. It never had a number, so nothing is skipped. This cannot be undone.`}
            confirmLabel="Delete draft"
            cancelLabel="Keep it"
            onConfirm={() => void remove()}
        />
    );
}

/**
 * Record money already taken — at the counter, by UPI, by bank transfer.
 * The design's dialog: how it was paid, a reference, the day. Nothing is
 * charged and nobody is contacted, and the dialog says so.
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
        showSuccess(`${invoice.number ?? "Invoice"} marked paid`);
        onOpenChange(false);
        router.refresh();
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[460px]">
                <DialogHeader>
                    <DialogTitle className="font-display text-[18px] tracking-[-0.02em]">
                        Record a payment
                    </DialogTitle>
                    <DialogDescription>
                        {invoice.number} · {invoice.total} from {invoice.who}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4">
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
                    <p className="rounded-[10px] bg-muted/60 px-3.5 py-3 text-[12.5px] leading-[1.55] text-muted-foreground">
                        This records money you have already taken. Nothing is
                        charged and nobody is contacted.
                    </p>
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button disabled={busy} onClick={() => void save()}>
                        {busy ? "Saving…" : "Mark it paid"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
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
    const [busy, setBusy] = useState<"credit" | "void" | "reissue" | null>(
        null,
    );
    const byCredit = registered || refund;

    async function run(kind: "credit" | "void" | "reissue") {
        if (!reason.trim()) {
            showError(
                byCredit
                    ? "Say why it is being cancelled."
                    : "Say why it is being voided.",
            );
            return;
        }
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
        if (kind === "reissue") {
            showSuccess(
                `${invoice.number ?? "Invoice"} voided — a corrected draft is open`,
            );
            router.push(`/billing/invoices/${res.data.id}/edit`);
            return;
        }
        showSuccess(
            kind === "credit"
                ? `${invoice.number ?? "Invoice"} cancelled with credit note ${res.data.number ?? ""}`.trim()
                : `${invoice.number ?? "Invoice"} voided`,
        );
        router.refresh();
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[460px]">
                <DialogHeader>
                    <DialogTitle className="font-display text-[18px] tracking-[-0.02em]">
                        {refund
                            ? `Refund ${invoice.number} with a credit note?`
                            : `Cancel ${invoice.number}?`}
                    </DialogTitle>
                    <DialogDescription>
                        {byCredit
                            ? `A credit note for ${invoice.total} cancels it. ${invoice.number} keeps its number and its lines, and nothing more is owed on it. This cannot be undone.`
                            : `It keeps its number and stays in the list, marked void, so ${invoice.number} always means the same thing. This cannot be undone.`}
                        {refund
                            ? ` Saroh records the credit note only — pay ${invoice.who} back yourself.`
                            : ""}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-1.5">
                    <Label htmlFor={reasonId}>Why</Label>
                    <Input
                        id={reasonId}
                        value={reason}
                        maxLength={500}
                        placeholder="Wrong amount, wrong person, returned…"
                        onChange={(e) => setReason(e.target.value)}
                    />
                    <p className="text-[12px] text-muted-foreground">
                        {byCredit
                            ? "Printed on the credit note."
                            : "Kept on the invoice, for whoever reads it later."}
                    </p>
                </div>
                <DialogFooter className="gap-2 sm:space-x-0">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Keep it
                    </Button>
                    {byCredit ? (
                        <Button
                            variant="destructive"
                            disabled={busy !== null}
                            onClick={() => void run("credit")}
                        >
                            {busy === "credit"
                                ? "Issuing the credit note…"
                                : refund
                                  ? "Issue the credit note"
                                  : "Cancel with a credit note"}
                        </Button>
                    ) : (
                        <>
                            <Button
                                variant="outline"
                                disabled={busy !== null}
                                onClick={() => void run("void")}
                            >
                                {busy === "void" ? "Voiding…" : "Void it"}
                            </Button>
                            <Button
                                variant="destructive"
                                disabled={busy !== null}
                                onClick={() => void run("reissue")}
                            >
                                {busy === "reissue"
                                    ? "Voiding…"
                                    : "Void and write again"}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

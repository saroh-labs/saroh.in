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
import { Pencil, Printer } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { OptionSelect } from "@/components/shared/option-select";
import {
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
 * What can be done to an invoice from its header, after the design: a draft
 * is issued, changed or deleted; an issued one gets a payment recorded; any
 * of them prints. Every move is forward-only on the server, so the ones that
 * cannot be taken back ask first.
 */
export function InvoiceHeaderActions({
    invoice,
    canWrite,
}: {
    invoice: InvoiceRef;
    canWrite: boolean;
}) {
    const router = useRouter();
    const [issuing, setIssuing] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [paying, setPaying] = useState(false);
    const [busy, setBusy] = useState(false);
    const draft = invoice.standing === "DRAFT";
    const open =
        invoice.standing === "ISSUED" || invoice.standing === "OVERDUE";

    async function issue() {
        setBusy(true);
        const res = await issueInvoice(invoice.id);
        setBusy(false);
        if (!res.ok) return showError(res.error);
        showSuccess(`${res.data.number ?? "Invoice"} issued`);
        router.refresh();
    }

    async function remove() {
        setBusy(true);
        const res = await deleteInvoice(invoice.id);
        setBusy(false);
        if (!res.ok) return showError(res.error);
        showSuccess("Draft deleted");
        router.push("/billing/invoices");
    }

    return (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
            {canWrite && draft ? (
                <>
                    <Button disabled={busy} onClick={() => setIssuing(true)}>
                        Issue it
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href={`/billing/invoices/${invoice.id}/edit`}>
                            <Pencil className="mr-1.5 size-4" />
                            Edit
                        </Link>
                    </Button>
                    <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => setDeleting(true)}
                    >
                        Delete draft
                    </Button>
                </>
            ) : null}
            {canWrite && open ? (
                <Button onClick={() => setPaying(true)}>
                    Record a payment
                </Button>
            ) : null}
            <Button variant="outline" onClick={() => window.print()}>
                <Printer className="mr-1.5 size-4" />
                Print
            </Button>

            <AlertDialog open={issuing} onOpenChange={setIssuing}>
                <AlertDialogContent className="max-w-[420px]">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="font-display text-[17px] tracking-[-0.02em]">
                            Issue {invoice.total} to {invoice.who}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            It takes the next number, and its lines can&apos;t
                            change after this — a mistake is voided and
                            reissued. Saroh doesn&apos;t send it: print it and
                            hand it over.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Not yet</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void issue()}>
                            Issue it
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <ConfirmDialog
                open={deleting}
                onOpenChange={setDeleting}
                title="Delete this draft?"
                description={`The draft for ${invoice.who} goes, lines and all. It never had a number, so nothing is skipped. This cannot be undone.`}
                confirmLabel="Delete draft"
                cancelLabel="Keep it"
                onConfirm={() => void remove()}
            />

            <RecordPaymentDialog
                open={paying}
                onOpenChange={setPaying}
                invoice={invoice}
            />
        </div>
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
 * "Void this invoice", beneath the invoice as the design draws it. Voiding
 * keeps the number and cannot be undone; the dialog asks why, and offers to
 * open a corrected draft in its place — the usual reason to void.
 */
export function VoidInvoice({ invoice }: { invoice: InvoiceRef }) {
    const router = useRouter();
    const reasonId = useId();
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState<"void" | "reissue" | null>(null);

    async function run(kind: "void" | "reissue") {
        if (!reason.trim()) {
            showError("Say why it is being voided.");
            return;
        }
        setBusy(kind);
        const res =
            kind === "void"
                ? await voidInvoice(invoice.id, reason.trim())
                : await reissueInvoice(invoice.id, reason.trim());
        setBusy(null);
        if (!res.ok) return showError(res.error);
        setOpen(false);
        if (kind === "reissue") {
            showSuccess(
                `${invoice.number ?? "Invoice"} voided — a corrected draft is open`,
            );
            router.push(`/billing/invoices/${res.data.id}/edit`);
            return;
        }
        showSuccess(`${invoice.number ?? "Invoice"} voided`);
        router.refresh();
    }

    return (
        <div className="flex flex-wrap items-center gap-3 print:hidden">
            <Button
                variant="outline"
                className="border-destructive/45 text-destructive-subtle-foreground hover:text-destructive-subtle-foreground"
                onClick={() => setOpen(true)}
            >
                Void this invoice
            </Button>
            <p className="text-[12.5px] text-muted-foreground">
                Voiding keeps the number and cannot be undone.
            </p>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-[460px]">
                    <DialogHeader>
                        <DialogTitle className="font-display text-[18px] tracking-[-0.02em]">
                            Void {invoice.number}?
                        </DialogTitle>
                        <DialogDescription>
                            It keeps its number and stays in the list, marked
                            void, so {invoice.number} always means the same
                            thing. This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-1.5">
                        <Label htmlFor={reasonId}>Why</Label>
                        <Input
                            id={reasonId}
                            value={reason}
                            maxLength={500}
                            placeholder="Wrong amount, wrong person…"
                            onChange={(e) => setReason(e.target.value)}
                        />
                        <p className="text-[12px] text-muted-foreground">
                            Kept on the invoice, for whoever reads it later.
                        </p>
                    </div>
                    <DialogFooter className="gap-2 sm:space-x-0">
                        <Button
                            variant="outline"
                            onClick={() => setOpen(false)}
                        >
                            Keep it
                        </Button>
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
                                : "Void and reissue"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

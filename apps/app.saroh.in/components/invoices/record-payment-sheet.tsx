"use client";

import { Button } from "@saroh/ui/button";
import { DatePicker } from "@saroh/ui/date-picker";
import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { couldntLoadLine, nothingChanged } from "@saroh/ui/lib/state-copy";
import { MoneyInput } from "@saroh/ui/money-input";
import { Notice } from "@saroh/ui/notice";
import { Skeleton } from "@saroh/ui/skeleton";
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess, showUndo, UNDO_MS } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { ChipGroup } from "@/components/shared/choice-group";
import { FormSheet } from "@/components/shared/form-sheet";
import { runAction } from "@/lib/api/run-action";
import {
    readInvoice,
    recordPayment,
    removePayment,
} from "@/lib/invoices/actions";
import type { PaymentTarget, ReceivedOn } from "@/lib/invoices/record-payment";
import {
    allLabel,
    amountHint,
    checkAmount,
    CHEQUE_WAITS_NOTE,
    FIRST_METHOD,
    fromPaise,
    overpayParts,
    paymentTargetOf,
    receiptNote,
    receivedDate,
    RECORD_METHODS,
    recordedToast,
    recordLabel,
    recordSubline,
    referenceWords,
    toPaise,
} from "@/lib/invoices/record-payment";
import type { Invoice, InvoicePaymentMethod } from "@/lib/invoices/service";
import { RECORD_PAYMENT } from "@/lib/invoices/words";

import { offerWhatsAppReceipt } from "./whatsapp-share";

/** The reason a payment taken back by Undo is kept with in the history. */
export const UNDONE_REASON = "Undone straight after recording";

/** What opens the sheet: an invoice read in full, or one to read on opening. */
export type RecordPaymentInvoice = PaymentTarget | { id: string; who: string };

function isTarget(i: RecordPaymentInvoice): i is PaymentTarget {
    return "leftToPay" in i;
}

/**
 * Record payment (DEC-173, U10 #1122; INVRecordPlus and
 * INVRecordPlusPhone): money already taken, all of what is left or part of
 * it, by cash, UPI, card, bank transfer, cheque or another way, with a
 * reference, the day it came in and a note only the business sees.
 *
 * One sheet, opened from the invoice's details, the list and the page. It
 * takes an invoice already read (`PaymentTarget`), or an id and who it is
 * for, and reads the rest when it opens (the customer's Invoices tab).
 *
 * - **Amount:** what is left, to start; less is a part payment and says
 *   what stays to pay. More is refused when Record is pressed, with what was
 *   typed kept and "Record ₹8,400" beside it (no advances yet).
 * - **A cheque** asks its number and bank, and is recorded as received
 *   and not in the bank yet; the invoice's Mark as in the bank and Bounced
 *   take it from there (`cheque-dialogs.tsx`).
 * - **After recording:** the toast has Undo for ten seconds, which removes
 *   the payment. The receipt goes by itself once Undo has passed, through
 *   the business's own email (the API holds it, `RECEIPT_HOLD_MS`); a
 *   cheque's goes once it is in the bank. With no email, the toast that
 *   follows offers "Share receipt on WhatsApp".
 *
 * Nothing is charged, and the sheet says so.
 */
export function RecordPaymentSheet({
    open,
    onOpenChange,
    invoice,
    onRecorded,
    onShareReceipt,
    returnFocusTo,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoice: RecordPaymentInvoice;
    /** The invoice as it now stands, for a screen that draws it itself. */
    onRecorded?: (invoice: Invoice) => void;
    /**
     * "Share receipt on WhatsApp" opens the share sheet (U11) on the
     * receipt; without it, WhatsApp opens straight away.
     */
    onShareReceipt?: () => void;
    returnFocusTo?: string | (() => HTMLElement | null | undefined);
}) {
    // Each opening is a fresh draft: paid today, all of what is left.
    const [opening, setOpening] = useState(0);
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) setOpening((n) => n + 1);
    }
    const shareHere = useShareHere(invoice.id, onShareReceipt);
    return (
        <RecordPaymentDraft
            key={opening}
            open={open}
            onOpenChange={onOpenChange}
            invoice={invoice}
            onRecorded={onRecorded}
            onShareReceipt={onShareReceipt ? shareHere : undefined}
            returnFocusTo={returnFocusTo}
        />
    );
}

/**
 * The receipt's share sheet, only while the screen that offered it is
 * still here and still on that invoice (review #14). The offer's toast
 * comes ten seconds after the payment; by then the details may have closed,
 * or moved on to the next invoice, whose share sheet would open on the
 * wrong receipt. It answers false then, and the toast opens WhatsApp itself.
 */
function useShareHere(
    invoiceId: string,
    share: (() => void) | undefined,
): (forInvoice: string) => boolean {
    const here = useRef({ mounted: false, invoiceId, share });
    useEffect(() => {
        here.current.invoiceId = invoiceId;
        here.current.share = share;
    }, [invoiceId, share]);
    useEffect(() => {
        const now = here.current;
        now.mounted = true;
        return () => {
            now.mounted = false;
        };
    }, []);
    return useCallback((forInvoice: string) => {
        const now = here.current;
        if (!now.mounted || now.invoiceId !== forInvoice || !now.share) {
            return false;
        }
        now.share();
        return true;
    }, []);
}

type Load =
    | { state: "ready"; target: PaymentTarget }
    | { state: "loading" }
    | { state: "failed"; error: string };

function RecordPaymentDraft({
    open,
    onOpenChange,
    invoice,
    onRecorded,
    onShareReceipt,
    returnFocusTo,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoice: RecordPaymentInvoice;
    onRecorded?: (invoice: Invoice) => void;
    /** The receipt's share sheet; false when its screen has gone. */
    onShareReceipt?: (invoiceId: string) => boolean;
    returnFocusTo?: string | (() => HTMLElement | null | undefined);
}) {
    const [load, setLoad] = useState<Load>(
        isTarget(invoice)
            ? { state: "ready", target: invoice }
            : { state: "loading" },
    );
    const [tries, setTries] = useState(0);
    const needsRead = !isTarget(invoice);
    const readId = invoice.id;
    const readWho = invoice.who;

    useEffect(() => {
        if (!open || !needsRead) return;
        let live = true;
        void readInvoice(readId)
            .then((res) => {
                if (!live) return;
                setLoad(
                    res.ok
                        ? {
                              state: "ready",
                              target: paymentTargetOf(res.data, readWho),
                          }
                        : { state: "failed", error: res.error },
                );
            })
            .catch(() => {
                if (live) {
                    setLoad({
                        state: "failed",
                        error: "That invoice could not be loaded.",
                    });
                }
            });
        return () => {
            live = false;
        };
    }, [open, needsRead, readId, readWho, tries]);

    if (load.state !== "ready") {
        return (
            <FormSheet
                open={open}
                title={RECORD_PAYMENT}
                description={`${readWho}'s invoice`}
                saveLabel={RECORD_PAYMENT}
                saveOff
                returnFocusTo={returnFocusTo}
                onClose={() => onOpenChange(false)}
                onSubmit={() => undefined}
            >
                {load.state === "loading" ? (
                    <div
                        role="status"
                        aria-label="Loading the invoice"
                        className="grid gap-3"
                    >
                        <Skeleton aria-hidden className="h-10" />
                        <Skeleton aria-hidden className="h-10" />
                        <Skeleton aria-hidden className="h-10" />
                    </div>
                ) : (
                    <Notice
                        tone="error"
                        action={
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setLoad({ state: "loading" });
                                    setTries((n) => n + 1);
                                }}
                            >
                                Try again
                            </Button>
                        }
                    >
                        {`${couldntLoadLine("this invoice")} ${nothingChanged()}`}
                    </Notice>
                )}
            </FormSheet>
        );
    }

    return (
        <RecordPaymentForm
            open={open}
            onOpenChange={onOpenChange}
            target={load.target}
            onRecorded={onRecorded}
            onShareReceipt={onShareReceipt}
            returnFocusTo={returnFocusTo}
        />
    );
}

type FieldName = "amount" | "chequeNumber" | "receivedAt";

function RecordPaymentForm({
    open,
    onOpenChange,
    target,
    onRecorded,
    onShareReceipt,
    returnFocusTo,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    target: PaymentTarget;
    onRecorded?: (invoice: Invoice) => void;
    onShareReceipt?: (invoiceId: string) => boolean;
    returnFocusTo?: string | (() => HTMLElement | null | undefined);
}) {
    const router = useRouter();
    const ids = {
        amount: useId(),
        method: useId(),
        reference: useId(),
        chequeNumber: useId(),
        chequeBank: useId(),
        picked: useId(),
        note: useId(),
    };
    const amountRef = useRef<HTMLInputElement>(null);
    const left = target.leftToPay;
    const [amount, setAmount] = useState(
        fromPaise(toPaise(left) ?? 0).replace(/\.00$/, ""),
    );
    const [method, setMethod] = useState<InvoicePaymentMethod>(FIRST_METHOD);
    const [reference, setReference] = useState("");
    const [chequeNumber, setChequeNumber] = useState("");
    const [chequeBank, setChequeBank] = useState("");
    const [on, setOn] = useState<ReceivedOn>("today");
    const [picked, setPicked] = useState<Date | undefined>(undefined);
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [problems, setProblems] = useState<
        Partial<Record<FieldName, ReactNode>>
    >({});

    const cheque = method === "CHEQUE";
    const leftPaise = toPaise(left) ?? 0;
    const typedPaise = toPaise(amount);
    const all = typedPaise !== null && typedPaise === leftPaise;
    const ref = referenceWords(method);

    function fixTo(paiseLeft: number) {
        setAmount(fromPaise(paiseLeft).replace(/\.00$/, ""));
        setProblems((p) => ({ ...p, amount: undefined }));
        amountRef.current?.focus();
    }

    function amountProblem(): ReactNode {
        const check = checkAmount(amount, target);
        if (check.ok) return undefined;
        if (check.reason !== "over") return check.message;
        const parts = overpayParts(
            toPaise(amount) ?? 0,
            check.leftPaise,
            target.currency,
        );
        return (
            <>
                {parts.said}{" "}
                <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 align-baseline text-[12.5px] font-semibold coarse:min-h-11"
                    onClick={() => fixTo(check.leftPaise)}
                >
                    {parts.fix}
                </Button>
            </>
        );
    }

    async function save() {
        const found: Partial<Record<FieldName, ReactNode>> = {};
        const check = checkAmount(amount, target);
        if (!check.ok) found.amount = amountProblem();
        if (cheque && !chequeNumber.trim()) {
            found.chequeNumber = "Enter the cheque number.";
        }
        const receivedAt = receivedDate(on, picked, new Date());
        if (!receivedAt) found.receivedAt = "Pick the day it came in.";
        setProblems(found);
        if (!check.ok || Object.keys(found).length > 0 || !receivedAt) {
            return;
        }

        const res = await runAction(
            () =>
                recordPayment(target.id, {
                    method,
                    amount: fromPaise(check.paise),
                    receivedAt: receivedAt.toISOString(),
                    ...(reference.trim()
                        ? { reference: reference.trim() }
                        : {}),
                    ...(note.trim() ? { note: note.trim() } : {}),
                    ...(cheque
                        ? {
                              chequeNumber: chequeNumber.trim(),
                              ...(chequeBank.trim()
                                  ? { chequeBank: chequeBank.trim() }
                                  : {}),
                          }
                        : {}),
                }),
            { setBusy },
        );
        if (!res) return;
        if (!res.ok) {
            // A refusal that names a field is said there; the sheet stays
            // open with what was typed.
            if (res.field === "amount") {
                setProblems({ amount: res.error });
                amountRef.current?.focus();
                return;
            }
            if (res.field === "chequeNumber") {
                setProblems({ chequeNumber: res.error });
                return;
            }
            if (res.field === "receivedAt" || res.field === "paidAt") {
                setProblems({ receivedAt: res.error });
                return;
            }
            showError(res.error);
            return;
        }

        onOpenChange(false);
        const recorded = res.data;
        onRecorded?.(recorded);
        router.refresh();

        // Where the receipt can't be emailed, it is offered on WhatsApp
        // once Undo has passed; a cheque's waits for the bank.
        const takeBackOffer =
            !cheque && !target.emailTo
                ? offerWhatsAppReceipt(
                      target.id,
                      target.who,
                      UNDO_MS,
                      onShareReceipt
                          ? () => onShareReceipt(target.id)
                          : undefined,
                  )
                : () => undefined;
        const words = recordedToast({
            paise: check.paise,
            method,
            target,
            leftAfter: recorded.leftToPay,
        });
        const paymentId = recorded.recorded?.paymentId;
        // An API too old to say which payment it wrote: no way to Undo it.
        if (!paymentId) {
            showSuccess(words.message, words.description);
            return;
        }
        showUndo(
            words.message,
            async () => {
                takeBackOffer();
                const undone = await removePayment(
                    target.id,
                    paymentId,
                    UNDONE_REASON,
                );
                if (undone.ok) {
                    onRecorded?.(undone.data);
                    router.refresh();
                }
                return undone;
            },
            { description: words.description },
        );
    }

    const hint = amountHint(amount, target);

    return (
        <FormSheet
            open={open}
            title={RECORD_PAYMENT}
            description={recordSubline(target)}
            pending={busy}
            saveLabel={recordLabel(amount, target.currency)}
            savingLabel="Recording…"
            fieldsClassName="gap-4"
            returnFocusTo={returnFocusTo}
            footNote={
                <p className="text-[12.5px] leading-[1.55] text-muted-foreground">
                    This records money you have already taken. Nothing is
                    charged. {receiptNote(method, target)}
                </p>
            }
            onClose={() => onOpenChange(false)}
            onSubmit={save}
        >
            <div className="grid gap-2">
                <Field
                    label="Amount received"
                    hint={hint ?? undefined}
                    error={problems.amount}
                >
                    <MoneyInput
                        ref={amountRef}
                        id={ids.amount}
                        currency={target.currency}
                        value={amount}
                        onValueChange={(v) => {
                            setAmount(v);
                            if (problems.amount) {
                                setProblems((p) => ({
                                    ...p,
                                    amount: undefined,
                                }));
                            }
                        }}
                    />
                </Field>
                <ChipGroup
                    label="How much"
                    choices={[
                        { value: "all", label: allLabel(target) },
                        { value: "other", label: "Another amount" },
                    ]}
                    value={all ? "all" : "other"}
                    onChange={(v) => {
                        if (v === "all") {
                            fixTo(leftPaise);
                            return;
                        }
                        // Another amount: the box is cleared for it.
                        if (all) setAmount("");
                        amountRef.current?.focus();
                    }}
                />
            </div>

            <div className="grid gap-1.5">
                <Label id={ids.method}>How</Label>
                <ChipGroup
                    labelledBy={ids.method}
                    choices={RECORD_METHODS.map((m) => ({
                        value: m.value,
                        label: m.label,
                    }))}
                    value={method}
                    onChange={(v) => {
                        setMethod(v);
                        setProblems((p) => ({ ...p, chequeNumber: undefined }));
                    }}
                />
            </div>

            {cheque ? (
                <div className="grid gap-3 min-[420px]:grid-cols-2">
                    <Field label="Cheque no." error={problems.chequeNumber}>
                        <Input
                            id={ids.chequeNumber}
                            value={chequeNumber}
                            maxLength={40}
                            inputMode="numeric"
                            placeholder="004512"
                            onChange={(e) => {
                                setChequeNumber(e.target.value);
                                if (problems.chequeNumber) {
                                    setProblems((p) => ({
                                        ...p,
                                        chequeNumber: undefined,
                                    }));
                                }
                            }}
                        />
                    </Field>
                    <Field label="Bank" optional>
                        <Input
                            id={ids.chequeBank}
                            value={chequeBank}
                            maxLength={120}
                            placeholder="HDFC Bank"
                            onChange={(e) => setChequeBank(e.target.value)}
                        />
                    </Field>
                    <p className="text-[12.5px] leading-[1.5] text-muted-foreground min-[420px]:col-span-2">
                        {CHEQUE_WAITS_NOTE}
                    </p>
                </div>
            ) : null}

            <Field label={ref.label} hint={ref.hint} optional holdsData={false}>
                <Input
                    id={ids.reference}
                    value={reference}
                    maxLength={120}
                    placeholder={ref.placeholder}
                    onChange={(e) => setReference(e.target.value)}
                />
            </Field>

            <Field label="Received on" group error={problems.receivedAt}>
                <div className="grid gap-2">
                    <ChipGroup
                        label="Received on"
                        choices={[
                            { value: "today", label: "Today" },
                            { value: "yesterday", label: "Yesterday" },
                            { value: "pick", label: "Pick" },
                        ]}
                        value={on}
                        onChange={(v) => {
                            setOn(v);
                            setProblems((p) => ({
                                ...p,
                                receivedAt: undefined,
                            }));
                        }}
                    />
                    {on === "pick" ? (
                        <DatePicker
                            id={ids.picked}
                            aria-label="The day it came in"
                            aria-invalid={
                                problems.receivedAt ? true : undefined
                            }
                            value={picked}
                            onValueChange={(d) => {
                                setPicked(d);
                                setProblems((p) => ({
                                    ...p,
                                    receivedAt: undefined,
                                }));
                            }}
                            disabledDays={{ after: new Date() }}
                            className="w-full"
                        />
                    ) : null}
                </div>
            </Field>

            <Field label="Note" hint="Only you see this." optional>
                <Textarea
                    id={ids.note}
                    value={note}
                    maxLength={500}
                    rows={2}
                    placeholder="e.g. paid at the counter by Meera"
                    onChange={(e) => setNote(e.target.value)}
                />
            </Field>
        </FormSheet>
    );
}

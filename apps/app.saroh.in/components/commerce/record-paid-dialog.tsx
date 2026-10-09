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
import { Input } from "@saroh/ui/input";
import { RadioGroup, RadioGroupItem } from "@saroh/ui/radio-group";
import { useId, useState } from "react";

import type { PaymentMethod } from "@/lib/invoices/service";
import type { HandRefundChoice } from "@/lib/orders/hand-refund";
import { handRefundAmount, handRefundVerb } from "@/lib/orders/hand-refund";
import { PAID_HOW } from "@/lib/orders/paid-how";

const CHOICE =
    "flex cursor-pointer items-center gap-2.5 rounded-[9px] border border-border px-3 py-2 text-[13px] transition-colors duration-fast hover:bg-muted/60 active:bg-accent-active coarse:min-h-11";

/**
 * "Record this order as paid?" (#834): asks how the business was paid —
 * cash, UPI, a bank transfer, a card at the counter or another way — so the
 * order, its timeline and its invoice can say. Recording money already
 * taken is not destructive, so the button is the primary one, not red.
 *
 * Nothing is chosen until the business picks, unless the caller already
 * knows (the payment banner's "Paid in cash" opens it on Cash).
 *
 * As "Record a refund?" (UX-061, #865) it asks how much went back — the
 * full amount left, or another amount up to it — and how.
 */
export function RecordPaidDialog({
    open,
    onOpenChange,
    initial,
    onRecord,
    refund = false,
    left,
    format,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** A way already known, picked when it opens. */
    initial?: PaymentMethod;
    /**
     * `amount`: another amount handed back, as money ("49.50"); absent for
     * the full amount (and for a payment).
     */
    onRecord: (how: PaymentMethod, amount?: string) => void;
    /**
     * Money handed back outside Saroh, and how it went back, so the
     * timeline can say.
     */
    refund?: boolean;
    /**
     * What is left to refund, in major units (#865). With `format`, a
     * refund offers "Another amount"; without, only the full amount.
     */
    left?: number;
    format?: (amount: number) => string;
}) {
    const id = useId();
    const [how, setHow] = useState<PaymentMethod | null>(initial ?? null);
    const [choice, setChoice] = useState<HandRefundChoice>("full");
    const [typed, setTyped] = useState("");
    const words = recordWords(refund);
    const amounts =
        refund && format !== undefined && left !== undefined && left > 0
            ? { left, format }
            : null;
    const amount = amounts
        ? handRefundAmount(choice, typed, amounts.left, amounts.format)
        : ({ kind: "full" } as const);
    const ready = amount.kind === "full" || amount.kind === "ok";

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="max-w-[420px]">
                <AlertDialogHeader>
                    <AlertDialogTitle className="font-display text-[17px] tracking-[-0.02em]">
                        {words.title}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {words.body}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                {amounts ? (
                    <fieldset className="grid gap-2">
                        <legend
                            id={`${id}-much`}
                            className="mb-2 text-[13px] font-semibold"
                        >
                            How much went back?
                        </legend>
                        <RadioGroup
                            aria-labelledby={`${id}-much`}
                            value={choice}
                            onValueChange={(v) =>
                                setChoice(v as HandRefundChoice)
                            }
                            className="grid gap-2 sm:grid-cols-2"
                        >
                            <label htmlFor={`${id}-full`} className={CHOICE}>
                                <RadioGroupItem
                                    id={`${id}-full`}
                                    value="full"
                                />
                                <span className="min-w-0 flex-1">
                                    Full amount
                                </span>
                                <span className="tabular-nums text-muted-foreground">
                                    {amounts.format(amounts.left)}
                                </span>
                            </label>
                            <label htmlFor={`${id}-another`} className={CHOICE}>
                                <RadioGroupItem
                                    id={`${id}-another`}
                                    value="another"
                                />
                                Another amount
                            </label>
                        </RadioGroup>
                        {choice === "another" ? (
                            <div className="grid gap-1">
                                <label
                                    htmlFor={`${id}-amount`}
                                    className="text-[12px] font-medium"
                                >
                                    Amount handed back, in rupees
                                </label>
                                <Input
                                    id={`${id}-amount`}
                                    type="text"
                                    inputMode="decimal"
                                    autoComplete="off"
                                    value={typed}
                                    onChange={(e) => setTyped(e.target.value)}
                                    placeholder={`Up to ${amounts.format(amounts.left)}`}
                                    aria-invalid={
                                        amount.kind === "bad" || undefined
                                    }
                                    aria-describedby={
                                        amount.kind === "bad"
                                            ? `${id}-amount-help`
                                            : undefined
                                    }
                                    className="tabular-nums sm:w-[160px]"
                                />
                                {amount.kind === "bad" ? (
                                    <p
                                        id={`${id}-amount-help`}
                                        role="alert"
                                        className="text-[12px] text-destructive-subtle-foreground"
                                    >
                                        {amount.error}
                                    </p>
                                ) : null}
                            </div>
                        ) : null}
                    </fieldset>
                ) : null}
                <fieldset className="grid gap-2">
                    <legend
                        id={`${id}-legend`}
                        className="mb-2 text-[13px] font-semibold"
                    >
                        {words.legend}
                    </legend>
                    <RadioGroup
                        aria-labelledby={`${id}-legend`}
                        value={how ?? ""}
                        onValueChange={(v) => setHow(v as PaymentMethod)}
                        className="grid gap-2 sm:grid-cols-2"
                    >
                        {PAID_HOW.map((w) => (
                            <label
                                key={w.value}
                                htmlFor={`${id}-${w.value}`}
                                className={CHOICE}
                            >
                                <RadioGroupItem
                                    id={`${id}-${w.value}`}
                                    value={w.value}
                                />
                                {w.label}
                            </label>
                        ))}
                    </RadioGroup>
                </fieldset>
                <AlertDialogFooter>
                    <AlertDialogCancel>Not yet</AlertDialogCancel>
                    <AlertDialogAction
                        disabled={how === null || !ready}
                        onClick={() => {
                            if (!how || !ready) return;
                            onRecord(
                                how,
                                amount.kind === "ok" ? amount.money : undefined,
                            );
                        }}
                    >
                        {refund && amounts
                            ? handRefundVerb(amount, amounts.format)
                            : words.verb}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

const PAID_WORDS = {
    title: "Record this order as paid?",
    body: "For a payment taken outside Saroh. Nothing is charged, and nothing is sent to the customer. This cannot be taken back.",
    legend: "How was it paid?",
    verb: "Record as paid",
};

const REFUND_WORDS = {
    title: "Record a refund?",
    body: "For money handed back outside Saroh, all of it or part. Nothing is sent back from here — to refund a card payment, use Refund. This cannot be taken back.",
    legend: "How did it go back?",
    verb: "Record as refunded",
};

/** The dialog's words: recording money taken, or money handed back. */
export function recordWords(refund: boolean) {
    return refund ? REFUND_WORDS : PAID_WORDS;
}

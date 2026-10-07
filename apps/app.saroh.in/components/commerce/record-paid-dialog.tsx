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
import { RadioGroup, RadioGroupItem } from "@saroh/ui/radio-group";
import { useId, useState } from "react";

import type { PaymentMethod } from "@/lib/invoices/service";
import { PAID_HOW } from "@/lib/orders/paid-how";

/**
 * "Record this order as paid?" (#834): asks how the business was paid —
 * cash, UPI, a bank transfer, a card at the counter or another way — so the
 * order, its timeline and its invoice can say. Recording money already
 * taken is not destructive, so the button is the primary one, not red.
 *
 * Nothing is chosen until the business picks, unless the caller already
 * knows (the payment banner's "Paid in cash" opens it on Cash).
 */
export function RecordPaidDialog({
    open,
    onOpenChange,
    initial,
    onRecord,
    refund = false,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** A way already known, picked when it opens. */
    initial?: PaymentMethod;
    onRecord: (how: PaymentMethod) => void;
    /**
     * "Record this order as refunded?" (UX-061): money handed back outside
     * Saroh, and how it went back, so the timeline can say.
     */
    refund?: boolean;
}) {
    const id = useId();
    const [how, setHow] = useState<PaymentMethod | null>(initial ?? null);
    const words = recordWords(refund);

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
                                className="flex cursor-pointer items-center gap-2.5 rounded-[9px] border border-border px-3 py-2 text-[13px] transition-colors duration-fast hover:bg-muted/60 active:bg-accent-active coarse:min-h-11"
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
                        disabled={how === null}
                        onClick={() => {
                            if (how) onRecord(how);
                        }}
                    >
                        {words.verb}
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
    title: "Record this order as refunded?",
    body: "For money handed back outside Saroh. Nothing is sent back from here — to refund a card payment, use Refund. This cannot be taken back.",
    legend: "How did it go back?",
    verb: "Record as refunded",
};

/** The dialog's words: recording money taken, or money handed back. */
export function recordWords(refund: boolean) {
    return refund ? REFUND_WORDS : PAID_WORDS;
}

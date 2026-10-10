"use client";

import { Input } from "@saroh/ui/input";
import { RadioGroup, RadioGroupItem } from "@saroh/ui/radio-group";
import { useId, useState } from "react";

import { FormDialog } from "@/components/shared/form-dialog";
import { runAction } from "@/lib/api/run-action";
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
     * the full amount (and for a payment). Resolves true once recorded:
     * the dialog waits, and stays open with the choice on a refusal.
     */
    onRecord: (how: PaymentMethod, amount?: string) => Promise<boolean>;
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
    const [tried, setTried] = useState(false);
    const [busy, setBusy] = useState(false);
    const words = recordWords(refund);
    const amounts =
        refund && format !== undefined && left !== undefined && left > 0
            ? { left, format }
            : null;
    const amount = amounts
        ? handRefundAmount(choice, typed, amounts.left, amounts.format)
        : ({ kind: "full" } as const);
    const ready = amount.kind === "full" || amount.kind === "ok";

    async function record() {
        setTried(true);
        if (!how || !ready) return;
        const ok = await runAction(
            () =>
                onRecord(how, amount.kind === "ok" ? amount.money : undefined),
            { setBusy },
        );
        if (ok) onOpenChange(false);
    }

    return (
        <FormDialog
            open={open}
            size="sm"
            title={words.title}
            description={words.body}
            pending={busy}
            saveLabel={
                refund && amounts
                    ? handRefundVerb(amount, amounts.format)
                    : words.verb
            }
            savingLabel="Recording…"
            onClose={() => onOpenChange(false)}
            onSubmit={record}
        >
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
                        onValueChange={(v) => setChoice(v as HandRefundChoice)}
                        className="grid gap-2 sm:grid-cols-2"
                    >
                        <label htmlFor={`${id}-full`} className={CHOICE}>
                            <RadioGroupItem id={`${id}-full`} value="full" />
                            <span className="min-w-0 flex-1">Full amount</span>
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
                {tried && how === null ? (
                    <p
                        role="alert"
                        className="text-[12px] text-destructive-subtle-foreground"
                    >
                        {words.pick}
                    </p>
                ) : null}
            </fieldset>
        </FormDialog>
    );
}

const PAID_WORDS = {
    title: "Record as paid",
    body: "For a payment taken outside Saroh. Nothing is charged, and nothing is sent to the customer. This cannot be undone.",
    legend: "How was it paid?",
    pick: "Choose how it was paid.",
    verb: "Record as paid",
};

const REFUND_WORDS = {
    title: "Record a refund",
    body: "For money handed back outside Saroh, all of it or part. Nothing is sent back from here. To refund a card payment, use Refund. This cannot be undone.",
    legend: "How did it go back?",
    pick: "Choose how it went back.",
    verb: "Record as refunded",
};

/** The dialog's words: recording money taken, or money handed back. */
export function recordWords(refund: boolean) {
    return refund ? REFUND_WORDS : PAID_WORDS;
}

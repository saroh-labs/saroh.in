"use client";

import { plural } from "@/lib/format/plural";
import { Input } from "@saroh/ui/input";
import { OptionSelect } from "@saroh/ui/option-select";
import { useId, useState } from "react";

import { putBackOf, refundableQuantity } from "@/lib/orders/lifecycle";
import type { OrderReadLine } from "@/lib/orders/read";
import type { RefundReason } from "@/lib/orders/refund-choice";
import {
    anotherAmount,
    reasonText,
    REFUND_REASON_MAX,
    REFUND_REASONS,
} from "@/lib/orders/refund-choice";

import { CheckRow } from "@/components/shared/fields/check-row";
import { Field } from "@saroh/ui/field";
import { MoneyInput } from "@saroh/ui/money-input";
import {
    OrderSheet,
    OrderSheetBody,
    OrderSheetFoot,
    useOrderSheetDraft,
} from "./order-sheet";

export interface RefundChoice {
    /** Null: everything still refundable, delivery included. */
    lines: { itemId: string; quantity: number }[] | null;
    /**
     * Units of the chosen lines that go back on the shelf once the refund is
     * confirmed ("Put back in stock"); empty to write them off.
     */
    putBack: { itemId: string; quantity: number }[];
    /** What the screen expects it to come to; the API works out the real sum. */
    amount: number;
    /** Why, as the order keeps it; null when none was chosen. */
    reason: string | null;
    /**
     * "Or another amount" (B8), as money ("49.50"): refunds that and no
     * line, so nothing comes back to the shelf. Null: the lines decide.
     */
    goodwill: string | null;
} /**
 * "What are you refunding?" — tick lines; every line refunds the order in
 * full, delivery too. Each line refunds what is left of it. Or type another
 * amount — late, a goodwill gesture — which refunds just that, needs a
 * reason, and puts nothing back on the shelf. The amount on the button is
 * what the lines paid; the API works out the exact sum (a discount is
 * spread across the lines), and caps another amount at what is left.
 *
 * A side sheet over the order: the lines scroll, and how the money goes
 * back stays at the foot with the Refund button and its amount.
 */
export function RefundPanel({
    open,
    returnFocus,
    ...draft
}: RefundProps & {
    open: boolean;
    /** Put the keyboard back on the button that opened it. */
    returnFocus?: () => void;
}) {
    return (
        <OrderSheet
            open={open}
            title="What are you refunding?"
            description="Tick the lines to refund, or type another amount."
            wide
            onClose={draft.onCancel}
            returnFocus={returnFocus}
        >
            <RefundDraft {...draft} />
        </OrderSheet>
    );
}

interface RefundProps {
    lines: OrderReadLine[];
    /** Paid and not yet refunded on the whole order. */
    remaining: number;
    shipping: number;
    /** "Back to Razorpay, in 3–5 days." */
    how: string;
    format: (amount: number) => string;
    /** The order's currency, for the amount box. */
    currency: string;
    onCancel: () => void;
    onRefund: (choice: RefundChoice) => void;
}

/** What is chosen in the sheet: a fresh one each time it opens. */
function RefundDraft({
    lines,
    remaining,
    shipping,
    how,
    format,
    currency,
    onRefund,
}: RefundProps) {
    const ids = useId();
    const open = lines.filter((l) => refundableQuantity(l) > 0);
    const [picked, setPicked] = useState<Record<string, boolean>>({});
    const [reason, setReason] = useState<RefundReason | "">("");
    const [other, setOther] = useState("");
    const [typed, setTyped] = useState("");
    const [stock, setStock] = useState<"back" | "off">("off");
    useOrderSheetDraft([picked, reason, other, typed, stock]);
    const worth = (l: OrderReadLine) =>
        Number(l.price ?? 0) * refundableQuantity(l);
    const sum = open.reduce((n, l) => n + (picked[l.id] ? worth(l) : 0), 0);
    const typedAmount = anotherAmount(typed, remaining, format);
    const goodwill = typedAmount.kind === "ok" ? typedAmount : null;
    const all = !goodwill && open.length > 0 && open.every((l) => picked[l.id]);
    const amount = goodwill ? goodwill.amount : all ? remaining : sum;
    const canPutBack = goodwill
        ? []
        : putBackOf(open.filter((l) => picked[l.id]));
    const putBackUnits = canPutBack.reduce((n, p) => n + p.quantity, 0);
    const why = reasonText(reason, other);
    const needsWhy = !!goodwill && !why;
    const off = typedAmount.kind === "bad" || needsWhy || amount === 0;

    return (
        <>
            <OrderSheetBody>
                <div className="flex flex-col gap-1">
                    {open.map((l) => {
                        const on = !!picked[l.id];
                        return (
                            <CheckRow
                                key={l.id}
                                checked={on}
                                onChange={(next) =>
                                    setPicked((p) => ({ ...p, [l.id]: next }))
                                }
                                className="w-full gap-2.5 rounded-[7px] px-1.5 py-2 hover:bg-muted active:bg-accent-active"
                            >
                                <span className="min-w-0 flex-1">
                                    {refundableQuantity(l)} ×{" "}
                                    {l.name ??
                                        "A product that no longer exists"}
                                    {l.variantTitle
                                        ? `, ${l.variantTitle}`
                                        : ""}
                                </span>
                                <span className="tabular-nums">
                                    {format(worth(l))}
                                </span>
                            </CheckRow>
                        );
                    })}
                </div>
                <div className="mt-2.5 flex flex-wrap items-end gap-2.5">
                    <Field label="Why">
                        <OptionSelect<RefundReason | "">
                            size="sm"
                            value={reason}
                            onValueChange={setReason}
                            placeholder="Choose a reason"
                            options={REFUND_REASONS}
                            aria-invalid={needsWhy || undefined}
                            aria-describedby={
                                needsWhy ? `${ids}-why-help` : undefined
                            }
                            className="w-full min-w-[150px]"
                        />
                    </Field>
                    {reason === "other" ? (
                        <Field
                            label="Say why"
                            optional
                            className="flex-[1_1_160px]"
                        >
                            <Input
                                dense
                                type="text"
                                value={other}
                                maxLength={REFUND_REASON_MAX}
                                onChange={(e) => setOther(e.target.value)}
                                className="w-full"
                            />
                        </Field>
                    ) : null}
                    <Field label="Or another amount">
                        <MoneyInput
                            dense
                            currency={currency}
                            value={typed}
                            onValueChange={setTyped}
                            aria-label="Refund another amount"
                            aria-invalid={
                                typedAmount.kind === "bad" || undefined
                            }
                            aria-describedby={
                                typedAmount.kind === "bad"
                                    ? `${ids}-amount-help`
                                    : undefined
                            }
                            className="w-[110px]"
                        />
                    </Field>
                    {putBackUnits > 0 ? (
                        <Field label="Stock">
                            <OptionSelect<"back" | "off">
                                size="sm"
                                value={stock}
                                onValueChange={setStock}
                                options={[
                                    {
                                        value: "back",
                                        label: "Put back in stock",
                                    },
                                    { value: "off", label: "Write off" },
                                ]}
                                className="w-full min-w-[150px]"
                            />
                        </Field>
                    ) : null}
                </div>
            </OrderSheetBody>
            <OrderSheetFoot
                tone="destructive"
                saveLabel={`Refund ${format(amount)}`}
                savingLabel="Refunding…"
                saveOff={off}
                onSubmit={() =>
                    onRefund({
                        lines: goodwill
                            ? null
                            : all
                              ? null
                              : open
                                    .filter((l) => picked[l.id])
                                    .map((l) => ({
                                        itemId: l.id,
                                        quantity: refundableQuantity(l),
                                    })),
                        putBack: stock === "back" ? canPutBack : [],
                        amount,
                        reason: why,
                        goodwill: goodwill ? goodwill.money : null,
                    })
                }
                note={
                    <>
                        {typedAmount.kind === "bad" ? (
                            <p
                                id={`${ids}-amount-help`}
                                role="alert"
                                className="mb-2 text-[12px] text-destructive-subtle-foreground"
                            >
                                {typedAmount.error}
                            </p>
                        ) : needsWhy ? (
                            <p
                                id={`${ids}-why-help`}
                                className="mb-2 text-[12px] text-destructive-subtle-foreground"
                            >
                                Say why you&apos;re refunding this amount.
                            </p>
                        ) : null}
                        <p className="text-[12px] text-muted-foreground">
                            {how}
                            {goodwill
                                ? " Only this amount goes back. The items stay sold."
                                : shipping > 0
                                  ? ` Ticking every line refunds the ${format(shipping)} delivery too.`
                                  : ""}
                            {putBackUnits > 0 && stock === "back"
                                ? ` ${putBackUnits} ${plural(putBackUnits, "goes", "go")} back in stock when the refund is confirmed.`
                                : ""}
                        </p>
                    </>
                }
            />
        </>
    );
}

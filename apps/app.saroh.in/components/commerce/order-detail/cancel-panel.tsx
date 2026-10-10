"use client";

import { Input } from "@saroh/ui/input";
import { OptionSelect } from "@saroh/ui/option-select";
import { useId, useState } from "react";

import { refundableQuantity } from "@/lib/orders/lifecycle";
import type { OrderReadLine } from "@/lib/orders/read";
import type { RefundReason } from "@/lib/orders/refund-choice";
import {
    reasonText,
    REFUND_REASON_MAX,
    REFUND_REASONS,
} from "@/lib/orders/refund-choice";

import { CheckRow } from "@/components/shared/check-row";
import { Field } from "@saroh/ui/field";
import {
    OrderSheet,
    OrderSheetBody,
    OrderSheetFoot,
    useOrderSheetDraft,
} from "./order-sheet";

export interface CancelChoice {
    reason: string | null;
    tell: boolean;
} /**
 * "Cancel #1063? It stays on record as cancelled, never deleted." — the
 * refund sheet with every line ticked (the design's option B): a cancel
 * refunds what is left on the order, so there is no "another amount" and
 * no line to leave out. It says how much goes back and how — less than
 * was paid once part went back by hand (#918, DEC-116) — from
 * `lib/orders/cancel-money.ts`. Why is kept on the order. Nothing paid or
 * nothing left: it just cancels, and its stock goes back on the shelf.
 *
 * A side sheet over the order: how much goes back stays at the foot with
 * the button that cancels.
 */
export function CancelPanel({
    open,
    returnFocus,
    ...draft
}: CancelProps & {
    open: boolean;
    /** Put the keyboard back on the button that opened it. */
    returnFocus?: () => void;
}) {
    return (
        <OrderSheet
            open={open}
            title={`Cancel ${draft.number}?`}
            description="It stays on record as cancelled, never deleted."
            onClose={draft.onCancel}
            returnFocus={returnFocus}
        >
            <CancelDraft {...draft} />
        </OrderSheet>
    );
}

interface CancelProps {
    number: string;
    first: string;
    lines: OrderReadLine[];
    /** How much goes back and how ("₹380 goes back to Razorpay, …"). */
    says: string;
    /** The button: "Refund ₹380", or "Cancel order" when nothing goes back. */
    confirm: string;
    canTell: boolean;
    format: ((amount: number) => string) | null;
    onCancel: () => void;
    onConfirm: (choice: CancelChoice) => void;
}

/** What is chosen in the sheet: a fresh one each time it opens. */
function CancelDraft({
    first,
    lines,
    says,
    confirm,
    canTell,
    format,
    onConfirm,
}: CancelProps) {
    const ids = useId();
    const [reason, setReason] = useState<RefundReason | "">("");
    const [other, setOther] = useState("");
    const [tell, setTell] = useState(canTell);
    useOrderSheetDraft([reason, other, tell]);

    return (
        <>
            <OrderSheetBody>
                <ul className="flex flex-col gap-1">
                    {lines.map((l) => (
                        <li
                            key={l.id}
                            className="flex items-center gap-2.5 px-1.5 py-2 text-[13px]"
                        >
                            <span
                                aria-hidden
                                className="size-4 shrink-0 rounded border-[5px] border-foreground"
                            />
                            <span className="min-w-0 flex-1">
                                {refundableQuantity(l) || l.quantity} ×{" "}
                                {l.name ?? "A product that no longer exists"}
                                {l.variantTitle ? `, ${l.variantTitle}` : ""}
                            </span>
                            {format && l.price !== undefined ? (
                                <span className="tabular-nums">
                                    {format(Number(l.price) * l.quantity)}
                                </span>
                            ) : null}
                        </li>
                    ))}
                </ul>
                <div className="mt-2.5 flex flex-wrap items-end gap-2.5">
                    <Field label="Why">
                        <OptionSelect<RefundReason | "">
                            size="sm"
                            value={reason}
                            onValueChange={setReason}
                            placeholder="Choose a reason"
                            options={REFUND_REASONS}
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
                </div>
                {canTell ? (
                    <CheckRow
                        checked={tell}
                        onChange={setTell}
                        className="mt-2 text-[12.5px]"
                    >
                        Tell {first} in their messages
                    </CheckRow>
                ) : (
                    <p className="mt-1 text-[12px] text-muted-foreground">
                        Nothing is sent to {first}. Let them know by email or
                        phone.
                    </p>
                )}
            </OrderSheetBody>
            <OrderSheetFoot
                // Its button cancels the order, so the way out says what
                // it keeps: never "Cancel" beside "Cancel order".
                cancelLabel="Keep order"
                tone="destructive"
                saveLabel={confirm}
                savingLabel="Cancelling…"
                note={
                    <p
                        id={`${ids}-how`}
                        className="text-[12px] text-muted-foreground"
                    >
                        {says}
                    </p>
                }
                onSubmit={() =>
                    onConfirm({
                        reason: reasonText(reason, other),
                        tell: canTell && tell,
                    })
                }
            />
        </>
    );
}

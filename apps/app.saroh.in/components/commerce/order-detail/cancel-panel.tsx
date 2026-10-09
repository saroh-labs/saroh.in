"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { useId, useState } from "react";

import { refundableQuantity } from "@/lib/orders/lifecycle";
import type { OrderReadLine } from "@/lib/orders/read";
import type { RefundReason } from "@/lib/orders/refund-choice";
import {
    reasonText,
    REFUND_REASON_MAX,
    REFUND_REASONS,
} from "@/lib/orders/refund-choice";

import { actionClass, FOCUS, PanelTitle, WorkPanel } from "./parts";

export interface CancelChoice {
    reason: string | null;
    tell: boolean;
}

const FIELD =
    "h-8 rounded-lg border border-border bg-card px-[9px] text-[12.5px] font-normal text-foreground coarse:h-11";

/**
 * "Cancel #1063? It stays on record as cancelled, never deleted." — the
 * refund sheet with every line ticked (the design's option B): a cancel
 * refunds what is left on the order, so there is no "another amount" and
 * no line to leave out. It says how much goes back and how — less than
 * was paid once part went back by hand (#918, DEC-116) — from
 * `lib/orders/cancel-money.ts`. Why is kept on the order. Nothing paid or
 * nothing left: it just cancels, and its stock goes back on the shelf.
 */
export function CancelPanel({
    number,
    first,
    lines,
    says,
    confirm,
    canTell,
    format,
    onCancel,
    onConfirm,
}: {
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
}) {
    const ids = useId();
    const [reason, setReason] = useState<RefundReason | "">("");
    const [other, setOther] = useState("");
    const [tell, setTell] = useState(canTell);

    return (
        <WorkPanel label={`Cancel ${number}`}>
            <PanelTitle>
                Cancel {number}? It stays on record as cancelled, never deleted.
            </PanelTitle>
            <ul className="mt-2.5 flex flex-col gap-1">
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
                <label className="grid gap-1 text-[12px] font-medium">
                    Why
                    <select
                        value={reason}
                        onChange={(e) =>
                            setReason(e.target.value as RefundReason | "")
                        }
                        className={cn(FOCUS, FIELD, "cursor-pointer")}
                    >
                        <option value="">Choose a reason</option>
                        {REFUND_REASONS.map((r) => (
                            <option key={r.value} value={r.value}>
                                {r.label}
                            </option>
                        ))}
                    </select>
                </label>
                {reason === "other" ? (
                    <label className="grid min-w-0 flex-[1_1_160px] gap-1 text-[12px] font-medium">
                        Say why
                        <input
                            type="text"
                            value={other}
                            maxLength={REFUND_REASON_MAX}
                            onChange={(e) => setOther(e.target.value)}
                            placeholder="Optional"
                            className={cn(FOCUS, FIELD, "w-full")}
                        />
                    </label>
                ) : null}
            </div>
            <p
                id={`${ids}-how`}
                className="mt-2 text-[12px] text-muted-foreground"
            >
                {says}
            </p>
            {canTell ? (
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-[12.5px]">
                    <input
                        type="checkbox"
                        checked={tell}
                        onChange={(e) => setTell(e.target.checked)}
                        className={cn(FOCUS, "size-4 cursor-pointer")}
                    />
                    Tell {first} in their messages
                </label>
            ) : (
                <p className="mt-1 text-[12px] text-muted-foreground">
                    Nothing is sent to {first} — let them know by email or
                    phone.
                </p>
            )}
            <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button
                    type="button"
                    variant="outline"
                    className={actionClass("ghost")}
                    onClick={onCancel}
                >
                    Cancel
                </Button>
                <Button
                    type="button"
                    variant="destructive"
                    className={actionClass("primary")}
                    aria-describedby={`${ids}-how`}
                    onClick={() =>
                        onConfirm({
                            reason: reasonText(reason, other),
                            tell: canTell && tell,
                        })
                    }
                >
                    {confirm}
                </Button>
            </div>
        </WorkPanel>
    );
}

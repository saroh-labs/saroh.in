"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
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

import { actionClass, FOCUS, PanelTitle, WorkPanel } from "./parts";

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
}

const FIELD =
    "h-8 rounded-lg border border-border bg-card px-[9px] text-[12.5px] font-normal text-foreground coarse:h-11";

/**
 * "What are you refunding?" — tick lines; every line refunds the order in
 * full, delivery too. Each line refunds what is left of it. Or type another
 * amount — late, a goodwill gesture — which refunds just that, needs a
 * reason, and puts nothing back on the shelf. The amount on the button is
 * what the lines paid; the API works out the exact sum (a discount is
 * spread across the lines), and caps another amount at what is left.
 */
export function RefundPanel({
    lines,
    remaining,
    shipping,
    how,
    format,
    onCancel,
    onRefund,
}: {
    lines: OrderReadLine[];
    /** Paid and not yet refunded on the whole order. */
    remaining: number;
    shipping: number;
    /** "Back to Razorpay, in 3–5 days." */
    how: string;
    format: (amount: number) => string;
    onCancel: () => void;
    onRefund: (choice: RefundChoice) => void;
}) {
    const ids = useId();
    const open = lines.filter((l) => refundableQuantity(l) > 0);
    const [picked, setPicked] = useState<Record<string, boolean>>({});
    const [reason, setReason] = useState<RefundReason | "">("");
    const [other, setOther] = useState("");
    const [typed, setTyped] = useState("");
    const [stock, setStock] = useState<"back" | "off">("off");
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
        <WorkPanel label="Refund">
            <PanelTitle>What are you refunding?</PanelTitle>
            <div className="mt-2.5 flex flex-col gap-1">
                {open.map((l) => {
                    const on = !!picked[l.id];
                    return (
                        <button
                            key={l.id}
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            onClick={() =>
                                setPicked((p) => ({ ...p, [l.id]: !p[l.id] }))
                            }
                            className={cn(
                                FOCUS,
                                "flex w-full items-center gap-2.5 rounded-[7px] px-1.5 py-2 text-left text-[13px] hover:bg-muted active:bg-accent-active coarse:min-h-11",
                            )}
                        >
                            <span
                                aria-hidden
                                className={cn(
                                    "size-4 shrink-0 rounded",
                                    on
                                        ? "border-[5px] border-foreground"
                                        : "border-[1.5px] border-border-strong",
                                )}
                            />
                            <span className="min-w-0 flex-1">
                                {refundableQuantity(l)} ×{" "}
                                {l.name ?? "A product that no longer exists"}
                                {l.variantTitle ? `, ${l.variantTitle}` : ""}
                            </span>
                            <span className="tabular-nums">
                                {format(worth(l))}
                            </span>
                        </button>
                    );
                })}
            </div>
            <div className="mt-2.5 flex flex-wrap items-end gap-2.5">
                <label className="grid gap-1 text-[12px] font-medium">
                    Why
                    <select
                        value={reason}
                        onChange={(e) =>
                            setReason(e.target.value as RefundReason | "")
                        }
                        aria-invalid={needsWhy || undefined}
                        aria-describedby={
                            needsWhy ? `${ids}-why-help` : undefined
                        }
                        className={cn(FOCUS, FIELD)}
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
                <label className="grid gap-1 text-[12px] font-medium">
                    Or another amount
                    <input
                        type="text"
                        inputMode="decimal"
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        placeholder="₹"
                        aria-label="Refund another amount, in rupees"
                        aria-invalid={typedAmount.kind === "bad" || undefined}
                        aria-describedby={
                            typedAmount.kind === "bad"
                                ? `${ids}-amount-help`
                                : undefined
                        }
                        className={cn(FOCUS, FIELD, "w-[110px] tabular-nums")}
                    />
                </label>
                {putBackUnits > 0 ? (
                    <label className="grid gap-1 text-[12px] font-medium">
                        Stock
                        <select
                            value={stock}
                            onChange={(e) =>
                                setStock(e.target.value as "back" | "off")
                            }
                            className={cn(FOCUS, FIELD)}
                        >
                            <option value="back">Put back in stock</option>
                            <option value="off">Write off</option>
                        </select>
                    </label>
                ) : null}
            </div>
            {typedAmount.kind === "bad" ? (
                <p
                    id={`${ids}-amount-help`}
                    role="alert"
                    className="mt-2 text-[12px] text-destructive-subtle-foreground"
                >
                    {typedAmount.error}
                </p>
            ) : needsWhy ? (
                <p
                    id={`${ids}-why-help`}
                    className="mt-2 text-[12px] text-destructive-subtle-foreground"
                >
                    Say why you&apos;re refunding this amount.
                </p>
            ) : null}
            <p className="mt-2 text-[12px] text-muted-foreground">
                {how}
                {goodwill
                    ? " Only this amount goes back; the items stay sold."
                    : shipping > 0
                      ? ` Ticking every line refunds the ${format(shipping)} delivery too.`
                      : ""}
                {putBackUnits > 0 && stock === "back"
                    ? ` ${putBackUnits} go${putBackUnits === 1 ? "es" : ""} back in stock when the refund is confirmed.`
                    : ""}
            </p>
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
                    disabled={off}
                    onClick={() =>
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
                >
                    Refund {format(amount)}
                </Button>
            </div>
        </WorkPanel>
    );
}

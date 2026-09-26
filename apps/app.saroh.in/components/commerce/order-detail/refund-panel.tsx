"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { useState } from "react";

import { putBackOf, refundableQuantity } from "@/lib/orders/lifecycle";
import type { OrderReadLine } from "@/lib/orders/read";

import { actionClass, FOCUS, PanelTitle, WorkPanel } from "./parts";

export interface RefundChoice {
    /** Null: everything still refundable, delivery included. */
    lines: { itemId: string; quantity: number }[] | null;
    /**
     * "Put N back in stock" (off unless ticked): units of the chosen lines
     * that go back on the shelf once the refund is confirmed.
     */
    putBack: { itemId: string; quantity: number }[];
    /** What the screen expects it to come to; the API works out the real sum. */
    amount: number;
}

/**
 * "What are you refunding?" — tick lines; every line refunds the order in
 * full, delivery too. Each line refunds what is left of it. The amount on the
 * button is what the lines paid; the API works out the exact sum (a discount
 * is spread across the lines) and holds nothing the client sends.
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
    const open = lines.filter((l) => refundableQuantity(l) > 0);
    const [picked, setPicked] = useState<Record<string, boolean>>({});
    const [restock, setRestock] = useState(false);
    const worth = (l: OrderReadLine) =>
        Number(l.price ?? 0) * refundableQuantity(l);
    const sum = open.reduce((n, l) => n + (picked[l.id] ? worth(l) : 0), 0);
    const all = open.length > 0 && open.every((l) => picked[l.id]);
    const amount = all ? remaining : sum;
    const canPutBack = putBackOf(open.filter((l) => picked[l.id]));
    const putBackUnits = canPutBack.reduce((n, p) => n + p.quantity, 0);

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
                                "flex w-full items-center gap-2.5 rounded-[7px] px-1.5 py-2 text-left text-[13px] hover:bg-muted coarse:min-h-11",
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
            {putBackUnits > 0 ? (
                <button
                    type="button"
                    role="checkbox"
                    aria-checked={restock}
                    onClick={() => setRestock((on) => !on)}
                    className={cn(
                        FOCUS,
                        "mt-2 flex w-full items-center gap-2.5 rounded-[7px] border-t border-border px-1.5 pb-2 pt-3 text-left text-[13px] hover:bg-muted coarse:min-h-11",
                    )}
                >
                    <span
                        aria-hidden
                        className={cn(
                            "size-4 shrink-0 rounded",
                            restock
                                ? "border-[5px] border-foreground"
                                : "border-[1.5px] border-border-strong",
                        )}
                    />
                    <span className="min-w-0 flex-1">
                        Put {putBackUnits} back in stock
                        <span className="block text-[12px] text-muted-foreground">
                            When the refund is confirmed.
                        </span>
                    </span>
                </button>
            ) : null}
            <p className="mt-2 text-[12px] text-muted-foreground">
                {how}
                {shipping > 0
                    ? ` Ticking every line refunds the ${format(shipping)} delivery too.`
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
                    disabled={sum === 0}
                    onClick={() =>
                        onRefund({
                            lines: all
                                ? null
                                : open
                                      .filter((l) => picked[l.id])
                                      .map((l) => ({
                                          itemId: l.id,
                                          quantity: refundableQuantity(l),
                                      })),
                            putBack: restock ? canPutBack : [],
                            amount,
                        })
                    }
                >
                    Refund {format(amount)}
                </Button>
            </div>
        </WorkPanel>
    );
}

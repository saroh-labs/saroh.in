"use client";

import { Checkbox } from "@saroh/ui/checkbox";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { useId, useState } from "react";

import { Chip } from "@/components/shared/chip";
import type { CashChange, NewOrderPay } from "@/lib/orders/new-order";

import { FIELD, FOCUS, StepCard } from "./parts";

/**
 * How it is paid (B13): cash (what was given, and the change), UPI at the
 * counter, the card machine, a payment link, or pay on collection — each
 * saying what it records and what it charges before the button. A chip
 * that can't be used here is off, and says why. A discount (a code or an
 * amount off) stays one tap away, as the old form had it.
 */
export function PayStep({
    options,
    pay,
    onPay,
    given,
    onGiven,
    change,
    total,
    note,
    format,
    discount,
    onDiscount,
    handedOver = null,
    onHandedOver,
}: {
    options: { key: NewOrderPay; label: string; off: string | null }[];
    pay: NewOrderPay;
    onPay: (pay: NewOrderPay) => void;
    given: string;
    onGiven: (given: string) => void;
    change: CashChange;
    total: string;
    note: string;
    format: (cents: number) => string;
    /** A code or an amount off, as typed. */
    discount: string;
    onDiscount: (discount: string) => void;
    /**
     * "Handed over now" (UX-059): null where it doesn't apply, else
     * whether the sale is Collected the moment it's made.
     */
    handedOver?: boolean | null;
    onHandedOver?: (on: boolean) => void;
}) {
    const givenId = useId();
    const handedId = useId();
    const discountId = useId();
    const [discounting, setDiscounting] = useState(discount !== "");
    return (
        <StepCard title="Payment">
            <div
                role="radiogroup"
                aria-label="Payment"
                className="flex flex-wrap gap-1.5"
            >
                {options.map((o) => (
                    <Chip
                        key={o.key}
                        on={pay === o.key}
                        disabled={o.off !== null}
                        title={o.off ?? undefined}
                        onClick={() => onPay(o.key)}
                        className="cursor-pointer active:scale-[0.97] disabled:cursor-not-allowed"
                    >
                        {o.label}
                    </Chip>
                ))}
            </div>
            {pay === "CASH" ? (
                <div className="mt-2.5 flex flex-wrap items-end gap-2.5">
                    <label
                        htmlFor={givenId}
                        className="flex-[1_1_140px] text-[12px] font-medium"
                    >
                        Cash given
                        <Input
                            id={givenId}
                            type="text"
                            inputMode="decimal"
                            value={given}
                            onChange={(e) => onGiven(e.target.value)}
                            placeholder={total}
                            autoComplete="off"
                            className={cn(FIELD, "mt-[5px]")}
                        />
                    </label>
                    <div
                        aria-live="polite"
                        className={cn(
                            "flex-[1_1_140px] pb-[9px] text-[13px] font-semibold",
                            change.kind === "short"
                                ? "text-destructive-subtle-foreground"
                                : "text-success-subtle-foreground",
                        )}
                    >
                        {change.kind === "change"
                            ? `Change ${format(change.cents)}`
                            : change.kind === "short"
                              ? `Short ${format(change.cents)}`
                              : ""}
                    </div>
                </div>
            ) : null}
            <p className="mt-2.5 text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                {note}
            </p>
            {handedOver !== null ? (
                <label
                    htmlFor={handedId}
                    className="mt-2.5 flex cursor-pointer items-start gap-2.5 text-[13px] coarse:min-h-11"
                >
                    <Checkbox
                        id={handedId}
                        checked={handedOver}
                        onCheckedChange={(v) => onHandedOver?.(v === true)}
                        className="mt-0.5"
                    />
                    <span>
                        <span className="font-semibold">Handed over now</span>
                        <span className="block text-[12px] text-muted-foreground">
                            {handedOver
                                ? "It's made Collected — nothing more to do."
                                : "It starts as New, to prepare and hand over later."}
                        </span>
                    </span>
                </label>
            ) : null}
            {discounting ? (
                <div className="mt-2.5">
                    <label
                        htmlFor={discountId}
                        className="text-[12px] font-medium"
                    >
                        Discount
                    </label>
                    <div className="mt-[5px] flex gap-2">
                        <Input
                            id={discountId}
                            value={discount}
                            onChange={(e) => onDiscount(e.target.value)}
                            placeholder="A code, or an amount off"
                            autoComplete="off"
                            className={FIELD}
                        />
                        <button
                            type="button"
                            onClick={() => {
                                onDiscount("");
                                setDiscounting(false);
                            }}
                            className={cn(
                                FOCUS,
                                "shrink-0 cursor-pointer rounded-lg px-2.5 text-[12.5px] font-semibold text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground active:bg-muted/70",
                            )}
                        >
                            Remove
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setDiscounting(true)}
                    className={cn(
                        FOCUS,
                        "mt-1.5 cursor-pointer rounded-md px-0 py-1 text-[12.5px] font-semibold text-brand transition-colors duration-fast hover:text-foreground active:opacity-80",
                    )}
                >
                    + Add a discount
                </button>
            )}
        </StepCard>
    );
}

"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { useId, useState } from "react";

import { Chip } from "@/components/shared/chip";
import type { CashChange, NewOrderPay } from "@/lib/orders/new-order";

import { CheckRow } from "@/components/shared/check-row";
import { Field } from "@saroh/ui/field";
import { MoneyInput } from "@saroh/ui/money-input";
import { Tip } from "@saroh/ui/tooltip";
import { FIELD, StepCard } from "./parts";

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
    currency,
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
    /** The location's currency, for the cash box; null before it is read. */
    currency: string | null;
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
                    <Tip label={o.off ?? undefined}>
                        <Chip
                            key={o.key}
                            on={pay === o.key}
                            disabled={o.off !== null}
                            onClick={() => onPay(o.key)}
                            className="cursor-pointer active:scale-[0.97] disabled:cursor-not-allowed"
                        >
                            {o.label}
                        </Chip>
                    </Tip>
                ))}
            </div>
            {pay === "CASH" ? (
                <div className="mt-2.5 flex flex-wrap items-end gap-2.5">
                    <Field label="Cash given" className="flex-[1_1_140px]">
                        {currency ? (
                            <MoneyInput
                                currency={currency}
                                value={given}
                                onValueChange={onGiven}
                                placeholder={total}
                                className="bg-card"
                            />
                        ) : (
                            <Input
                                type="text"
                                inputMode="decimal"
                                value={given}
                                onChange={(e) => onGiven(e.target.value)}
                                placeholder={total}
                                autoComplete="off"
                                className="bg-card"
                            />
                        )}
                    </Field>
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
                <CheckRow
                    checked={handedOver}
                    onChange={(on) => onHandedOver?.(on)}
                    className="mt-2.5 items-start gap-2.5"
                    boxClassName="mt-0.5"
                >
                    <span>
                        <span className="font-semibold">Handed over now</span>
                        <span className="block text-[12px] text-muted-foreground">
                            {handedOver
                                ? "It's made Collected — nothing more to do."
                                : "It starts as New, to prepare and hand over later."}
                        </span>
                    </span>
                </CheckRow>
            ) : null}
            {discounting ? (
                <Field label="Discount" htmlFor={discountId} className="mt-2.5">
                    <div className="flex gap-2">
                        <Input
                            id={discountId}
                            value={discount}
                            onChange={(e) => onDiscount(e.target.value)}
                            placeholder="A code, or an amount off"
                            autoComplete="off"
                            className={FIELD}
                        />
                        <Button
                            variant="ghost"
                            size="xs"
                            type="button"
                            onClick={() => {
                                onDiscount("");
                                setDiscounting(false);
                            }}
                            className="shrink-0 text-muted-foreground"
                        >
                            Remove
                        </Button>
                    </div>
                </Field>
            ) : (
                <Button
                    variant="link"
                    size="inline"
                    type="button"
                    onClick={() => setDiscounting(true)}
                    className="mt-1.5 cursor-pointer px-0 py-1 text-foreground underline decoration-border-strong underline-offset-4 transition-colors duration-fast hover:decoration-foreground active:opacity-80"
                >
                    + Add a discount
                </Button>
            )}
        </StepCard>
    );
}

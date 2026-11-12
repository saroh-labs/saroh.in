"use client";

import { useId } from "react";

import type { Trade } from "@/lib/organizations/trade";
import {
    TRADE_CHOICES,
    TRADE_OTHER_LABEL,
    TRADE_OTHER_MAX,
    TRADE_OTHER_PLACEHOLDER,
} from "@/lib/organizations/trade";
import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { OptionSelect } from "@saroh/ui/option-select";

/**
 * "What kind of place is it?" (DEC-216; owner, 12 Nov 2026): a dropdown of
 * the categories with Other last, and with Other a field for the trade in
 * the merchant's own words ("Bakery"). Setup asks it of a business on its
 * first step, and Settings › Business changes it in its sheet. A salon or a
 * gym starts Bookings with sample services (DEC-189).
 */
export function SetupTradeChoice({
    value,
    onChange,
    other,
    onOtherChange,
    otherError,
    hint,
    label = "What kind of place is it?",
    labelHidden,
}: {
    value: Trade | null | undefined;
    onChange: (trade: Trade) => void;
    /** The trade typed beside Other. */
    other: string;
    onOtherChange: (typed: string) => void;
    /** What is wrong with the typed trade, once checked. */
    otherError?: string;
    /** The line under the dropdown. */
    hint?: string;
    label?: string;
    /** The label is for screen readers only (a sheet whose title says it). */
    labelHidden?: boolean;
}) {
    const id = useId();
    return (
        <div data-trade-choice="" className="flex flex-col gap-4">
            <Field
                label={label}
                labelHidden={labelHidden}
                hint={hint}
                htmlFor={`${id}-trade`}
            >
                <OptionSelect<Trade | "">
                    id={`${id}-trade`}
                    aria-label={label}
                    aria-describedby={hint ? `${id}-trade-note` : undefined}
                    value={value ?? ""}
                    onValueChange={(next) => {
                        if (next) onChange(next);
                    }}
                    placeholder="Choose one"
                    options={TRADE_CHOICES}
                />
            </Field>
            {value === "other" ? (
                <Field label={TRADE_OTHER_LABEL} error={otherError}>
                    <Input
                        data-trade-other=""
                        value={other}
                        maxLength={TRADE_OTHER_MAX}
                        placeholder={TRADE_OTHER_PLACEHOLDER}
                        autoComplete="off"
                        onChange={(e) => onOtherChange(e.target.value)}
                    />
                </Field>
            ) : null}
        </div>
    );
}

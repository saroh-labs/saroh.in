"use client";

import * as React from "react";
import { cn } from "../../lib/utils";
import { Input } from "./input";

/**
 * The one way to type an amount of money.
 *
 * The currency's sign sits inside the box as a fixed prefix, so it is never
 * in the label ("Price (₹)"), never a placeholder that vanishes with the
 * first digit, and never a second control asking which currency: the
 * business has one, and the caller passes it. The keyboard is the decimal
 * pad, the figures are tabular, and the value stays a plain string of digits
 * ("1250.50") from the box to the API, which does the arithmetic.
 */

/** The sign a currency is written with ("₹" for INR). */
export function moneySign(currency: string): string {
    try {
        const part = new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency,
            currencyDisplay: "narrowSymbol",
        })
            .formatToParts(0)
            .find((p) => p.type === "currency");
        return part?.value ?? currency;
    } catch {
        return currency;
    }
}

/** How many decimal places a currency is written with (2 for INR, 0 for JPY). */
export function moneyDecimals(currency: string): number {
    try {
        return (
            new Intl.NumberFormat("en-IN", {
                style: "currency",
                currency,
            }).resolvedOptions().maximumFractionDigits ?? 2
        );
    } catch {
        return 2;
    }
}

/**
 * What a money box keeps of what was typed or pasted: digits and at most one
 * decimal point, with no more places than the currency has. "₹1,299.505"
 * becomes "1299.50". An empty box stays empty: nothing typed is not zero.
 */
export function cleanMoney(raw: string, decimals: number): string {
    const kept = raw.replace(/[^\d.]/g, "");
    const dot = kept.indexOf(".");
    if (decimals <= 0) return (dot === -1 ? kept : kept.slice(0, dot)).trim();
    if (dot === -1) return kept;
    const whole = kept.slice(0, dot);
    const places = kept
        .slice(dot + 1)
        .replace(/\./g, "")
        .slice(0, decimals);
    return `${whole}.${places}`;
}

export interface MoneyInputProps extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "type" | "inputMode"
> {
    /** The business's currency code ("INR"). Never asked of the merchant. */
    currency: string;
    value: string;
    onValueChange: (value: string) => void;
    /** False for an amount in whole units only. */
    allowDecimals?: boolean;
}

const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
    (
        {
            currency,
            value,
            onValueChange,
            allowDecimals = true,
            className,
            style,
            ...props
        },
        ref,
    ) => {
        const sign = moneySign(currency);
        const decimals = allowDecimals ? moneyDecimals(currency) : 0;
        return (
            <div className="relative" data-slot="money-input">
                <span
                    aria-hidden
                    data-slot="money-sign"
                    className={cn(
                        "pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground coarse:text-base",
                        props.disabled && "text-disabled-foreground",
                    )}
                >
                    {sign}
                </span>
                <Input
                    ref={ref}
                    type="text"
                    inputMode={decimals > 0 ? "decimal" : "numeric"}
                    autoComplete="off"
                    value={value}
                    onChange={(event) =>
                        onValueChange(cleanMoney(event.target.value, decimals))
                    }
                    className={cn("tabular-nums", className)}
                    // Room for the sign, however long ("₹", "AED").
                    style={{
                        paddingLeft: `calc(0.75rem + ${sign.length}ch + 0.5rem)`,
                        ...style,
                    }}
                    {...props}
                />
            </div>
        );
    },
);
MoneyInput.displayName = "MoneyInput";

export { MoneyInput };

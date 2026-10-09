"use client";

import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";

import { currencySymbol } from "@/lib/format/money";
import type { LateUnit } from "@/lib/stores/late-after";

/**
 * The Delivery edit panel's two fields. A money amount with its
 * currency's sign inside the box: "[ 40  ₹ ]".
 */
export function MoneyField({
    id,
    value,
    placeholder,
    currency,
    readOnly,
    invalid,
    describedBy,
    onChange,
}: {
    id: string;
    value: string;
    placeholder: string;
    currency: string;
    readOnly: boolean;
    invalid: boolean;
    describedBy?: string;
    onChange: (value: string) => void;
}) {
    return (
        <div className="relative">
            <Input
                id={id}
                inputMode="decimal"
                placeholder={placeholder}
                value={value}
                readOnly={readOnly}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                onChange={(e) => onChange(e.target.value)}
                className="pr-8 tabular-nums"
            />
            <span
                aria-hidden
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground"
            >
                {currencySymbol(currency)}
            </span>
        </div>
    );
}

/**
 * "[ 24  hours ▾ ]": the amount and its unit as one control with one
 * border, the way the merchant reads it. The unit's name for a screen
 * reader is "‹Way› late after, unit", never a bare "hours".
 */
export function LateAfterField({
    id,
    way,
    amount,
    unit,
    readOnly,
    invalid,
    describedBy,
    onAmount,
    onUnit,
}: {
    id: string;
    way: string;
    amount: string;
    unit: LateUnit;
    readOnly: boolean;
    invalid: boolean;
    describedBy?: string;
    onAmount: (value: string) => void;
    onUnit: (unit: LateUnit) => void;
}) {
    return (
        <div
            className={cn(
                "flex h-[38px] items-stretch overflow-hidden rounded-md border border-input bg-field transition-colors duration-fast focus-within:border-ring focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background hover:border-border-strong coarse:h-11",
                invalid && "border-destructive bg-destructive-subtle",
            )}
        >
            <Input
                id={id}
                inputMode="numeric"
                value={amount}
                readOnly={readOnly}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                onChange={(e) => onAmount(e.target.value)}
                className="h-full w-12 shrink-0 rounded-none border-0 bg-transparent pr-1 tabular-nums focus-visible:ring-0 focus-visible:ring-offset-0 aria-[invalid=true]:bg-transparent coarse:h-full"
            />
            <Select
                value={unit}
                onValueChange={(v) => onUnit(v as LateUnit)}
                disabled={readOnly}
            >
                <SelectTrigger
                    aria-label={`${way} late after, unit`}
                    className="h-full min-w-0 flex-1 gap-1.5 rounded-none border-0 bg-transparent px-2.5 hover:border-0 focus:ring-0 focus:ring-offset-0 disabled:bg-transparent coarse:h-full"
                >
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="hours">hours</SelectItem>
                    <SelectItem value="minutes">minutes</SelectItem>
                </SelectContent>
            </Select>
        </div>
    );
}

"use client";

import { cn } from "@saroh/ui/lib/utils";
import { Segmented } from "@saroh/ui/segmented";

/**
 * Whether a detail shows on the shop, beside the detail itself. The team
 * sees every detail on the product page; this decides what customers see.
 * A pill that says its state in words, not a bare toggle.
 */
export function ShopSwitch({
    field,
    checked,
    onCheckedChange,
    disabled,
}: {
    /** Named in the accessible label: "How to use: shown on the shop." */
    field: string;
    checked: boolean;
    onCheckedChange: (next: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={`${field}: ${checked ? "shown on the shop" : "team only"}. Change it.`}
            disabled={disabled}
            onClick={() => onCheckedChange(!checked)}
            className={cn(
                "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-border px-[9px] text-[11.5px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed coarse:h-11",
                checked
                    ? "bg-success-subtle text-success-subtle-foreground"
                    : "bg-muted/60 text-muted-foreground",
            )}
        >
            <span
                aria-hidden
                className={cn(
                    "size-[7px] shrink-0 rounded-full",
                    checked ? "bg-success" : "bg-muted-foreground/50",
                )}
            />
            {checked ? "On the shop" : "Team only"}
        </button>
    );
}

/**
 * Two or three mutually exclusive choices drawn as one segmented control
 * ("Made here | Made by someone else"). A radiogroup: arrow keys move.
 */
export function ChoicePills<V extends string>({
    label,
    value,
    options,
    onChange,
    disabled,
}: {
    label: string;
    value: V;
    options: readonly { value: V; label: string }[];
    onChange: (next: V) => void;
    disabled?: boolean;
}) {
    return (
        <Segmented
            label={label}
            value={value}
            onValueChange={onChange}
            options={options}
            disabled={disabled}
        />
    );
}

"use client";

import { cn } from "@saroh/ui/lib/utils";

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
        <div
            role="radiogroup"
            aria-label={label}
            className="flex w-fit flex-wrap rounded-[9px] bg-muted p-[3px]"
            onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const i = options.findIndex((o) => o.value === value);
                const step = e.key === "ArrowRight" ? 1 : -1;
                const next = options.at(
                    (i + step + options.length) % options.length,
                );
                if (next) onChange(next.value);
            }}
        >
            {options.map((o) => {
                const on = o.value === value;
                return (
                    <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        tabIndex={on ? 0 : -1}
                        disabled={disabled}
                        onClick={() => onChange(o.value)}
                        className={cn(
                            "rounded-[7px] px-3 py-1.5 text-[12.5px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed coarse:min-h-11",
                            on
                                ? "bg-card text-foreground shadow-[0_1px_3px_rgba(28,28,26,0.12)]"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}

"use client";

import { ChoiceGroup } from "@saroh/ui/choice-group";
import { cn } from "@saroh/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * The Offers tab's small shared pieces, drawn the way the design draws them
 * (plans catalogue U9): the raised card, the saffron dot beside something the
 * draft changed, and the two-way segmented switch.
 */

export function OfferCard({
    children,
    className,
    label,
}: {
    children: ReactNode;
    className?: string;
    label?: string;
}) {
    return (
        <section
            aria-label={label}
            className={cn(
                "grid content-start gap-3 rounded-[12px] border border-border bg-card p-4",
                className,
            )}
        >
            {children}
        </section>
    );
}

/** Changed from the live version. Said in words too, for a screen reader. */
export function ChangedDot({ on }: { on: boolean }) {
    if (!on) return null;
    return (
        <span className="inline-flex items-center">
            <span
                aria-hidden
                className="size-[7px] rounded-full bg-highlight"
            />
            <span className="sr-only"> (changed in the draft)</span>
        </span>
    );
}

/** The design's saffron tick, on the shared checkbox. */
export const CHECKBOX_SAFFRON =
    "data-[state=checked]:border-highlight data-[state=checked]:bg-highlight data-[state=checked]:text-highlight-foreground dark:data-[state=checked]:border-highlight dark:data-[state=checked]:bg-highlight";

/**
 * Two or more choices in a pill, one picked: a radio group, so arrows move
 * between them and Tab lands on the picked one.
 */
export function Segmented<T extends string>({
    label,
    value,
    options,
    onValue,
    disabled,
    size = "md",
}: {
    label: string;
    value: T;
    options: readonly { value: T; label: string }[];
    onValue: (v: T) => void;
    disabled?: boolean;
    size?: "sm" | "md";
}) {
    return (
        <ChoiceGroup
            label={label}
            value={value}
            onChange={onValue}
            choices={options}
            disabled={disabled}
            className="flex gap-0.5 justify-self-start rounded-[9px] border border-border bg-background p-[3px]"
            itemClassName={(on) =>
                cn(
                    "rounded-[6px] font-semibold focus-visible:ring-offset-0",
                    size === "sm"
                        ? "h-[26px] px-2.5 text-[12px]"
                        : "h-7 px-3 text-[12.5px]",
                    on
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground active:bg-secondary",
                )
            }
        />
    );
}

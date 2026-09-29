"use client";

import { cn } from "@saroh/ui/lib/utils";
import { useId } from "react";

import { FIELD_LABEL } from "@/components/sites/section-fields/constants";

/**
 * One of a few answers, as the Site Editor design draws its choices
 * (`choice()` in Saroh Site Editor.dc.html): a caption, a row of bordered
 * buttons with the chosen one outlined, and a note under them. Used for a
 * list section's display options (Show as, Photos, Descriptions, Prices,
 * Highlight, G16) and a page's "In the menu".
 *
 * Buttons with `aria-pressed` in a labelled group, so each answer is one
 * press and says whether it is the chosen one. Disabled, the answers still
 * show which is chosen; the reason is said beside the controls by whoever
 * disables them, never in a tooltip.
 */
export function ChoiceField<V extends string | boolean>({
    label,
    options,
    value,
    onChange,
    note,
    disabled = false,
}: {
    label: string;
    options: readonly (readonly [V, string])[];
    value: V;
    onChange: (next: V) => void;
    note?: string;
    disabled?: boolean;
}) {
    const id = useId();
    return (
        <div
            role="group"
            aria-labelledby={`${id}-label`}
            aria-describedby={note ? `${id}-note` : undefined}
            className="grid gap-1.5"
        >
            <span id={`${id}-label`} className={FIELD_LABEL}>
                {label}
            </span>
            <div className="flex flex-wrap gap-1.5">
                {options.map(([option, words]) => {
                    const on = option === value;
                    return (
                        <button
                            key={String(option)}
                            type="button"
                            aria-pressed={on}
                            disabled={disabled}
                            onClick={() => {
                                if (!on) onChange(option);
                            }}
                            className={cn(
                                "h-8 cursor-pointer rounded-lg border px-3 text-[0.78125rem] text-foreground transition-[background-color,border-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 active:scale-[0.97] disabled:cursor-not-allowed disabled:text-muted-foreground disabled:active:scale-100 coarse:h-11",
                                on
                                    ? "border-foreground bg-secondary font-semibold"
                                    : "border-border bg-card font-medium hover:bg-secondary disabled:hover:bg-card",
                            )}
                        >
                            {words}
                        </button>
                    );
                })}
            </div>
            {note ? (
                <p
                    id={`${id}-note`}
                    className="text-xs leading-relaxed text-muted-foreground"
                >
                    {note}
                </p>
            ) : null}
        </div>
    );
}

/** The design's Show / Hide pair, for a switch that is on unless hidden. */
export const SHOW_HIDE = [
    [true, "Show"],
    [false, "Hide"],
] as const satisfies readonly (readonly [boolean, string])[];

"use client";

import { useId } from "react";

import { ChoiceChip } from "../fields/choice-chip";
import { useRovingChoice } from "../roving";
import type { LibraryControl } from "./types";

/**
 * A toolbar or layout choice as a labelled radio group of `ChoiceChip`s
 * (WAI-ARIA radio group, as `BillingToggle`): one tab stop, the arrow keys
 * move between the options and choose as they go.
 */
export function RadioGroup({
    control,
    value,
    onChange,
}: {
    control: LibraryControl;
    value: string;
    onChange: (value: string) => void;
}) {
    const labelId = useId();
    const options = control.options;
    const { refs, onKeyDown } = useRovingChoice(options.length, (i) =>
        onChange(options[i].value),
    );
    const chosen = Math.max(
        0,
        options.findIndex((o) => o.value === value),
    );

    return (
        <div className="grid min-w-0 gap-2">
            <span
                id={labelId}
                className="text-[13px] font-semibold text-foreground"
            >
                {control.label}
            </span>
            <div
                role="radiogroup"
                aria-labelledby={labelId}
                className="flex flex-wrap gap-2"
            >
                {options.map((o, i) => (
                    <ChoiceChip
                        key={o.value}
                        ref={(el) => {
                            refs.current[i] = el;
                        }}
                        role="radio"
                        aria-checked={i === chosen}
                        tabIndex={i === chosen ? 0 : -1}
                        on={i === chosen}
                        onClick={() => onChange(o.value)}
                        onKeyDown={(e) => onKeyDown(e, i)}
                    >
                        {o.label}
                    </ChoiceChip>
                ))}
            </div>
        </div>
    );
}

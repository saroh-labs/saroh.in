"use client";

import { cn } from "../cn";
import { ring } from "../ring";
import { useRovingChoice } from "../roving";

/**
 * The Pricing design's Monthly / "Yearly · N months free" (or "save up
 * to X%" with a yearly offer, DEC-239) switch. Shown only when the
 * catalogue offers yearly billing.
 */
export function BillingToggle({
    yearly,
    label,
    onChange,
}: {
    yearly: boolean;
    /** The yearly side's words, from the model. */
    label: string;
    onChange: (yearly: boolean) => void;
}) {
    return (
        <SegmentToggle
            label="Billing"
            value={yearly}
            off="Monthly"
            on={label}
            onChange={onChange}
        />
    );
}

/**
 * Two choices on white, the chosen one in Ink (the Pricing boards'
 * segment): a radiogroup with one tab stop, the arrow keys moving between
 * the two and choosing as they go (WAI-ARIA radio group).
 */
export function SegmentToggle({
    label,
    value,
    off,
    on,
    onChange,
}: {
    /** The group's name, for a screen reader. */
    label: string;
    value: boolean;
    off: string;
    on: string;
    onChange: (value: boolean) => void;
}) {
    const options = [
        { value: false, label: off },
        { value: true, label: on },
    ];
    const { refs, onKeyDown } = useRovingChoice(options.length, (i) =>
        onChange(options[i].value),
    );

    return (
        <div
            role="radiogroup"
            aria-label={label}
            className="flex gap-0.5 rounded-mk-btn border border-border bg-card p-1"
        >
            {options.map((o, i) => {
                const chosen = o.value === value;
                return (
                    <button
                        key={o.label}
                        ref={(el) => {
                            refs.current[i] = el;
                        }}
                        type="button"
                        role="radio"
                        aria-checked={chosen}
                        tabIndex={chosen ? 0 : -1}
                        onClick={() => onChange(o.value)}
                        onKeyDown={(e) => onKeyDown(e, i)}
                        className={cn(
                            `h-11 min-w-11 cursor-pointer rounded-mk-control border-none px-3 text-sm font-semibold transition-colors duration-fast ease-out min-[760px]:h-10 min-[760px]:px-4 ${ring()} active:scale-[0.98]`,
                            chosen
                                ? "bg-foreground text-background"
                                : "bg-transparent text-mk-copy hover:bg-mk-hover",
                        )}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}

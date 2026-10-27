"use client";

import type { KeyboardEvent } from "react";
import { useRef } from "react";

import { cn } from "@/lib/cn";

/**
 * The Pricing design's Monthly / "Yearly · N months free" switch: a
 * radiogroup on white, the chosen side in Ink. Shown only when the
 * catalogue offers yearly billing. One tab stop; the arrow keys move
 * between the two and choose as they go (WAI-ARIA radio group).
 */
export function BillingToggle({
    yearly,
    freeMonths,
    onChange,
}: {
    yearly: boolean;
    freeMonths: number;
    onChange: (yearly: boolean) => void;
}) {
    const refs = useRef<(HTMLButtonElement | null)[]>([]);
    const options = [
        { yearly: false, label: "Monthly" },
        { yearly: true, label: `Yearly · ${freeMonths} months free` },
    ];

    const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
        const step =
            e.key === "ArrowRight" || e.key === "ArrowDown"
                ? 1
                : e.key === "ArrowLeft" || e.key === "ArrowUp"
                  ? -1
                  : 0;
        if (!step) return;
        e.preventDefault();
        const next = (i + step + options.length) % options.length;
        onChange(options[next].yearly);
        refs.current[next]?.focus();
    };

    return (
        <div
            role="radiogroup"
            aria-label="Billing"
            className="flex gap-0.5 rounded-mk-btn border border-border bg-card p-1"
        >
            {options.map((o, i) => {
                const on = o.yearly === yearly;
                return (
                    <button
                        key={o.label}
                        ref={(el) => {
                            refs.current[i] = el;
                        }}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        tabIndex={on ? 0 : -1}
                        onClick={() => onChange(o.yearly)}
                        onKeyDown={(e) => onKeyDown(e, i)}
                        className={cn(
                            "h-9 cursor-pointer rounded-mk-control border-none px-4 text-sm font-semibold transition-colors duration-fast ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid] active:scale-[0.98]",
                            on
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

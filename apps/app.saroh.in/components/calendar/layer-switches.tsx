"use client";

import { cn } from "@saroh/ui/lib/utils";

import type { LayerStyle, Off } from "@/lib/calendar/layers";
import type { CalendarMonth, LayerKey } from "@/lib/calendar/types";

import { TONE_BORDER, TONE_FILL } from "./tones";

/**
 * A switch per layer with its month's count, after the design: on is an
 * Ink edge and a filled swatch, off an outline. A layer that could not be
 * read is named, dashed and can't be switched.
 */
export function LayerSwitches({
    layers,
    off,
    totals,
    failed,
    onToggle,
}: {
    layers: LayerStyle[];
    off: Off;
    totals: CalendarMonth["totals"];
    failed: Set<string>;
    onToggle: (key: LayerKey) => void;
}) {
    return (
        <div
            role="group"
            aria-label="Show on the calendar"
            className="flex flex-wrap gap-1.5"
        >
            {layers.map((layer) => {
                const on = !off[layer.key];
                const broken = failed.has(layer.key);
                return (
                    <button
                        key={layer.key}
                        type="button"
                        aria-pressed={on}
                        disabled={broken}
                        onClick={() => onToggle(layer.key)}
                        className={cn(
                            "inline-flex h-8 items-center gap-[5px] rounded-full border px-[11px] text-[12.5px] font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 coarse:h-11",
                            broken
                                ? "cursor-not-allowed border-dashed border-border text-muted-foreground"
                                : on
                                  ? "cursor-pointer border-foreground bg-card text-foreground hover:bg-accent active:bg-accent-active"
                                  : "cursor-pointer border-border bg-transparent text-muted-foreground hover:border-border-strong hover:bg-accent active:bg-accent-active",
                        )}
                    >
                        <span
                            aria-hidden
                            className={cn(
                                "mr-1.5 inline-block size-[9px] rounded-[3px] border-[1.5px]",
                                TONE_BORDER[layer.tone],
                                on && !broken
                                    ? TONE_FILL[layer.tone]
                                    : "bg-transparent",
                            )}
                        />
                        {layer.label}
                        <span className="font-medium text-muted-foreground">
                            {broken
                                ? "couldn't load"
                                : (totals[layer.key] ?? 0)}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

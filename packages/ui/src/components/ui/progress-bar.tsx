import * as React from "react";
import { cn } from "../../lib/utils";

export type ProgressTone = "ink" | "success" | "warning" | "danger" | "neutral";

const FILL: Record<ProgressTone, string> = {
    // Ink by default. Saffron is the menu's marker, not a fill.
    ink: "bg-foreground",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-destructive",
    neutral: "bg-neutral-400",
};

const SIZE = { xs: "h-1", sm: "h-1.5" } as const;

/** The one wording for a checklist's count: "2 of 4 done". */
export function doneOf(done: number, total: number) {
    return `${done} of ${total} done`;
}

export interface ProgressBarProps extends Omit<
    React.HTMLAttributes<HTMLDivElement>,
    "children"
> {
    value: number;
    max: number;
    /** `xs` (4px) inside a row, `sm` (6px) on its own line. */
    size?: keyof typeof SIZE;
    tone?: ProgressTone;
    /**
     * Required. What the bar measures, as a person would say it: "2 of 4
     * done", "6 of 10 visits used". A bar alone says nothing to a screen
     * reader, and little to anyone in bright light.
     */
    label: string;
}

/**
 * The one progress bar: a track and a fill. It only ever shows a measured
 * amount (never a guess at how long something will take), clamps what it is
 * given, and draws an empty track for a `max` of zero.
 */
export function ProgressBar({
    value,
    max,
    size = "sm",
    tone = "ink",
    label,
    className,
    ...props
}: ProgressBarProps) {
    const safeMax = max > 0 ? max : 0;
    const now = Math.min(Math.max(value, 0), safeMax);
    const percent = safeMax === 0 ? 0 : (now / safeMax) * 100;
    return (
        <div
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={safeMax}
            aria-valuenow={now}
            aria-valuetext={label}
            data-progress-bar=""
            className={cn(
                "w-full overflow-hidden rounded-full bg-muted",
                SIZE[size],
                className,
            )}
            {...props}
        >
            <div
                className={cn(
                    "h-full rounded-full transition-[width] duration-base ease-out",
                    FILL[tone],
                )}
                style={{ width: `${percent}%` }}
            />
        </div>
    );
}

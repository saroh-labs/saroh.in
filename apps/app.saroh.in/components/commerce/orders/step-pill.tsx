import { cn } from "@saroh/ui/lib/utils";

import { StatusBadge } from "@/components/shared/status-badge";
import type { RowProgress, StepTone } from "@/lib/orders/list-row";

/**
 * The step an order is at: the shared status badge with a dot in the text's
 * colour, toned by where the order stands, and under it a bar of one
 * segment per step. The word is the signal and
 * the colour only reinforces it; the bar is said in words for a screen reader
 * ("Step 2 of 4 · Pick-up · Next: Ready").
 */

/** The current step's segment: the pill's own text colour. */
const NOW: Record<StepTone, string> = {
    new: "bg-foreground",
    prog: "bg-foreground",
    ready: "bg-success-subtle-foreground",
    done: "bg-muted-foreground",
    bad: "bg-destructive-subtle-foreground",
};

export function StepPill({
    progress,
    dot = true,
}: {
    progress: RowProgress;
    /** The desk row's dot; a phone card's pill has none (the design). */
    dot?: boolean;
}) {
    return (
        <StatusBadge tone={progress.tone} dot={dot}>
            {progress.word}
        </StatusBadge>
    );
}

/** One segment per step: done, now, still to come. */
export function StepBar({ progress }: { progress: RowProgress }) {
    const { index, count, label, tone } = progress;
    if (index === null || !label) return null;
    return (
        <span
            role="img"
            aria-label={label}
            title={label}
            className="flex w-14 flex-none gap-[3px]"
        >
            {Array.from({ length: count }, (_, i) => (
                <span
                    key={i}
                    className={cn(
                        "h-1 flex-1 rounded-sm",
                        tone === "done" || i < index
                            ? "bg-muted-foreground"
                            : i === index
                              ? NOW[tone]
                              : "bg-border",
                    )}
                />
            ))}
        </span>
    );
}

/** "12 min", or "Late · 3 h" in words and in red — never colour alone. */
export function AgeText({
    age,
    className,
}: {
    age: { text: string; late: boolean };
    className?: string;
}) {
    return (
        <span
            className={cn(
                "whitespace-nowrap text-[11.5px] tabular-nums",
                age.late
                    ? "font-bold text-destructive-subtle-foreground"
                    : "font-medium text-muted-foreground",
                className,
            )}
        >
            {age.text}
        </span>
    );
}

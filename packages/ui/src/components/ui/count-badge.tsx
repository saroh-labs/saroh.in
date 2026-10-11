import * as React from "react";
import { ABSENT_MARK } from "../../lib/absent";
import { cn } from "../../lib/utils";

export type CountTone = "neutral" | "strong" | "danger";

const TONE: Record<CountTone, string> = {
    // A plain tally: how many rows a tab holds.
    neutral: "bg-muted text-muted-foreground data-[on]:text-foreground",
    // Something is waiting: unread notifications, open orders. Ink, because
    // Saffron is the menu's marker and nothing else.
    strong: "bg-primary text-primary-foreground",
    // Something has gone wrong: overdue, failed.
    danger: "bg-destructive-subtle text-destructive-subtle-foreground",
};

export interface CountBadgeProps extends Omit<
    React.HTMLAttributes<HTMLSpanElement>,
    "children"
> {
    /**
     * A number, or a few words ("2 need you"). `null` is a count that could
     * not be read: it draws the absent mark (`lib/absent.ts`) and is named
     * "count unknown", never 0.
     */
    count: number | string | null;
    tone?: CountTone;
    /** A number above this draws as "99+". The name keeps the real one. */
    max?: number;
    /** On the selected tab, a neutral count reads in Ink. */
    on?: boolean;
}

/**
 * The one count: unread on the bell and the menu, and the tally on a tab.
 * 11px, tabular, a full pill. It is not a status (that is `Badge`) and it
 * never stands alone: the thing beside it says what is counted.
 */
export function CountBadge({
    count,
    tone = "neutral",
    max,
    on = false,
    className,
    ...props
}: CountBadgeProps) {
    const over = typeof count === "number" && max !== undefined && count > max;
    return (
        <span
            data-count-badge=""
            data-on={on ? "" : undefined}
            aria-label={count === null ? "count unknown" : undefined}
            className={cn(
                "inline-flex min-w-5 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-[7px] py-0.5 text-[11px] font-semibold tabular-nums leading-[1.3]",
                TONE[tone],
                className,
            )}
            {...props}
        >
            {count === null ? ABSENT_MARK : over ? `${max}+` : count}
        </span>
    );
}

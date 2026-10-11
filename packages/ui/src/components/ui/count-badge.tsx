import * as React from "react";
import { ABSENT_MARK } from "../../lib/absent";
import { cn } from "../../lib/utils";

export type CountTone = "neutral" | "strong" | "danger";

/*
 * ONE COUNT STYLE. A count on a tab or a menu row is `neutral`: a plain
 * tally. It is dark (`strong`) or red (`danger`) ONLY when the number
 * means "this needs you now", and then the badge says so to a screen
 * reader too (`says`): colour alone tells nobody what a number is for.
 * A count inside a chip is not this piece: it is the quiet number after
 * the chip's label (`FilterChips`).
 */
const TONE: Record<CountTone, string> = {
    // A plain tally: how many rows a tab holds.
    neutral: "bg-muted text-muted-foreground data-[on]:text-foreground",
    // Needs you now: unread notifications, open orders, lines running
    // low. Ink, because Saffron is the menu's marker and nothing else.
    strong: "bg-primary text-primary-foreground",
    // Needs you now, and something has gone wrong: overdue, failed.
    danger: "bg-destructive-subtle text-destructive-subtle-foreground",
};

/** The two tones that mean "needs you now". */
export type AttentionTone = Exclude<CountTone, "neutral">;

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
    /**
     * What an attention count means, after the number: "need you",
     * "unread", "overdue". The badge is then named "4 need you". Give
     * it whenever `tone` is `strong` or `danger`.
     */
    says?: string;
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
    says,
    className,
    ...props
}: CountBadgeProps) {
    const over = typeof count === "number" && max !== undefined && count > max;
    return (
        <span
            data-count-badge=""
            data-on={on ? "" : undefined}
            data-tone={tone}
            aria-label={
                count === null
                    ? "count unknown"
                    : says && tone !== "neutral"
                      ? `${count} ${says}`
                      : undefined
            }
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

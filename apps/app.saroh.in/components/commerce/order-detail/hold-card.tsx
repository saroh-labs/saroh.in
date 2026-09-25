"use client";

import { cn } from "@saroh/ui/lib/utils";
import { useEffect } from "react";

import { useClock } from "@/lib/hooks/use-clock";
import { HOLD_MS } from "@/lib/orders/lifecycle";

import { FOCUS } from "./parts";

export interface Hold {
    kind: "ready" | "refund";
    /** When it is recorded, epoch ms. */
    until: number;
}

/**
 * A step held for ten seconds before it is recorded (ADR-008): Ready, in the
 * Saffron card, and a refund, in the red one — the amount, where it goes,
 * Undo and "now". Nothing is sent to the customer by either; the card says
 * what IS recorded instead of promising a text.
 *
 * It counts itself down and calls `onDone` once when the time is up; the
 * screen owns what "done" does. Leaving the page is handled there too.
 */
export function HoldCard({
    hold,
    title,
    note,
    body,
    undoLabel = "Undo",
    nowLabel,
    onUndo,
    onNow,
    onDone,
}: {
    hold: Hold;
    /** Worded with the seconds: (s) => `Marking ready in ${s}s`. */
    title: (seconds: number) => string;
    /** The small line: what leaving the page does. */
    note?: string;
    /** What is recorded, and what is not. */
    body: string;
    undoLabel?: string;
    nowLabel: string;
    onUndo: () => void;
    onNow: () => void;
    onDone: () => void;
}) {
    const now = useClock(250);
    const left = now === null ? HOLD_MS : Math.max(0, hold.until - now);
    const done = now !== null && left === 0;

    useEffect(() => {
        if (done) onDone();
    }, [done, onDone]);

    const refund = hold.kind === "refund";
    return (
        <div
            role="status"
            className={cn(
                "rounded-[10px] border px-[13px] py-[11px]",
                refund
                    ? "border-destructive-subtle-foreground bg-destructive-subtle"
                    : "border-highlight-border bg-brand-subtle",
            )}
        >
            <div className="flex flex-wrap items-center gap-2.5">
                <span
                    className={cn(
                        "flex-[1_1_220px] text-[13px] font-semibold tabular-nums",
                        refund
                            ? "text-destructive-subtle-foreground"
                            : "text-brand-subtle-foreground",
                    )}
                >
                    {title(Math.ceil(left / 1000))}
                </span>
                <button
                    type="button"
                    onClick={onUndo}
                    className={cn(
                        FOCUS,
                        "h-[30px] rounded-lg border bg-card px-3 text-[12.5px] font-semibold coarse:h-11",
                        refund
                            ? "border-destructive-subtle-foreground"
                            : "border-highlight-border",
                    )}
                >
                    {undoLabel}
                </button>
                <button
                    type="button"
                    onClick={onNow}
                    className={cn(
                        FOCUS,
                        "h-[30px] rounded-lg px-3 text-[12.5px] font-semibold coarse:h-11",
                        refund
                            ? "text-destructive-subtle-foreground"
                            : "text-brand-subtle-foreground",
                    )}
                >
                    {nowLabel}
                </button>
            </div>
            {note ? (
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                    {note}
                </p>
            ) : null}
            <p className="mt-1.5 text-pretty text-[12.5px] leading-[1.5] text-neutral-700 dark:text-muted-foreground">
                {body}
            </p>
            <div
                aria-hidden
                className="mt-[9px] h-[3px] rounded-full bg-foreground/5"
            >
                <div
                    className={cn(
                        "h-[3px] rounded-full transition-[width] duration-200 ease-linear",
                        refund
                            ? "bg-destructive-subtle-foreground"
                            : "bg-highlight",
                    )}
                    style={{ width: `${(left / HOLD_MS) * 100}%` }}
                />
            </div>
        </div>
    );
}

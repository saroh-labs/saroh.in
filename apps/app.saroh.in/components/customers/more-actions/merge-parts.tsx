"use client";

import { CheckRow } from "@/components/shared/fields/check-row";
import { cn } from "@saroh/ui/lib/utils";
import { Globe } from "lucide-react";
import { useId } from "react";

/**
 * The merge dialog's pieces (C10): a pick in a row, and what the dialog
 * says and asks about the website sign-in.
 */

/**
 * One pick in a row of the merge dialog: the design's bordered cell,
 * heavier when chosen, dashed where the record has nothing to take.
 */
export function pickClass(on: boolean, empty = false) {
    return cn(
        "min-w-0 break-words rounded-[8px] px-[9px] py-[7px] text-left text-[12.5px] text-foreground [overflow-wrap:anywhere] coarse:min-h-11",
        empty
            ? "border border-dashed border-border bg-card italic text-muted-foreground"
            : on
              ? "border-[1.5px] border-foreground bg-muted font-semibold active:bg-accent"
              : "border border-border bg-card hover:bg-muted active:bg-accent",
    );
}

/**
 * Who signs in on the website afterwards (ADR-011): the lines C9 wrote,
 * "Don't carry the sign-in over" when the other's account would move, and
 * the tick Merge waits for when an account will see more than before.
 */
export function AccountBox({
    lines,
    canLeaveBehind,
    carry,
    onCarry,
    needsConfirm,
    confirmed,
    onConfirm,
    disabled,
}: {
    lines: string[];
    canLeaveBehind: boolean;
    carry: boolean;
    onCarry: (carry: boolean) => void;
    needsConfirm: boolean;
    confirmed: boolean;
    onConfirm: (confirmed: boolean) => void;
    disabled: boolean;
}) {
    const id = useId();
    return (
        <div className="mt-3 grid gap-2 rounded-[10px] border border-border bg-muted px-[13px] py-2.5 text-[12.5px]">
            {lines.map((l) => (
                <p key={l} className="flex items-start gap-1.5">
                    <Globe
                        aria-hidden
                        className="mt-[3px] size-[13px] shrink-0 text-muted-foreground"
                    />
                    <span>{l}.</span>
                </p>
            ))}
            {canLeaveBehind ? (
                <CheckRow
                    id={`${id}-leave`}
                    checked={!carry}
                    disabled={disabled}
                    onChange={(leave) => onCarry(!leave)}
                    className="text-[12.5px]"
                >
                    Don&apos;t carry the sign-in over
                </CheckRow>
            ) : null}
            {needsConfirm ? (
                <CheckRow
                    id={`${id}-confirm`}
                    checked={confirmed}
                    disabled={disabled}
                    onChange={onConfirm}
                    className="text-[12.5px] font-semibold"
                >
                    I&apos;ve checked this email is theirs
                </CheckRow>
            ) : null}
        </div>
    );
}

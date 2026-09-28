"use client";

import { Checkbox } from "@saroh/ui/checkbox";
import { cn } from "@saroh/ui/lib/utils";
import { Globe } from "lucide-react";
import { useId } from "react";

/**
 * The merge dialog's pieces (C10): a pick in a row, and what the dialog
 * says and asks about the website sign-in.
 */

/** One pick in a row: the design's bordered button, heavier when chosen. */
export function Choice({
    on,
    empty = false,
    disabled,
    onClick,
    children,
}: {
    on: boolean;
    empty?: boolean;
    disabled: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled || empty}
            title={empty ? "Nothing to take from this record" : undefined}
            onClick={onClick}
            className={cn(
                "min-w-0 break-words rounded-[8px] px-[9px] py-[7px] text-left text-[12.5px] text-foreground transition-colors duration-fast [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11",
                empty
                    ? "cursor-not-allowed border border-dashed border-border bg-card italic text-muted-foreground"
                    : on
                      ? "cursor-pointer border-[1.5px] border-foreground bg-muted font-semibold active:bg-accent"
                      : "cursor-pointer border border-border bg-card hover:bg-muted active:bg-accent",
            )}
        >
            {children}
        </button>
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
                <label
                    htmlFor={`${id}-leave`}
                    className="flex cursor-pointer items-center gap-2 coarse:min-h-11"
                >
                    <Checkbox
                        id={`${id}-leave`}
                        checked={!carry}
                        disabled={disabled}
                        onCheckedChange={(v) => onCarry(v !== true)}
                    />
                    Don&apos;t carry the sign-in over
                </label>
            ) : null}
            {needsConfirm ? (
                <label
                    htmlFor={`${id}-confirm`}
                    className="flex cursor-pointer items-center gap-2 font-semibold coarse:min-h-11"
                >
                    <Checkbox
                        id={`${id}-confirm`}
                        checked={confirmed}
                        disabled={disabled}
                        onCheckedChange={(v) => onConfirm(v === true)}
                    />
                    I&apos;ve checked this email is theirs
                </label>
            ) : null}
        </div>
    );
}

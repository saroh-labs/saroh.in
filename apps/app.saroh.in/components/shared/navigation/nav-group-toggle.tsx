"use client";

import { CountBadge } from "@saroh/ui/count-badge";
import { cn } from "@saroh/ui/lib/utils";
import { ChevronDown } from "lucide-react";

/**
 * A menu group's label as the button that folds it (DEC-279): the same
 * piece on the desk rail and in the phone's More sheet. Folded, it says how
 * many rows it holds and rolls up what is waiting inside, so a fold never
 * hides work. Its name is the label; folded, ", 7 items" follows it.
 */
export function NavGroupToggle({
    label,
    open,
    controls,
    rows,
    waiting,
    onToggle,
    className,
}: {
    label: string;
    open: boolean;
    /** The id of the element holding the group's rows. */
    controls: string;
    rows: number;
    waiting: number;
    onToggle: () => void;
    className?: string;
}) {
    return (
        <button
            type="button"
            aria-expanded={open}
            aria-controls={controls}
            onClick={onToggle}
            className={cn(
                "label flex w-full items-center gap-1.5 rounded-md text-left transition-colors duration-fast hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                className,
            )}
        >
            <span>{label}</span>
            {open ? null : (
                <>
                    <span aria-hidden>· {rows}</span>
                    <span className="sr-only">
                        , {rows} {rows === 1 ? "item" : "items"}
                    </span>
                    {waiting > 0 ? (
                        <CountBadge
                            count={waiting}
                            tone="strong"
                            aria-label={`${waiting} waiting`}
                            className="shrink-0 normal-case tracking-normal"
                        />
                    ) : null}
                </>
            )}
            <ChevronDown
                aria-hidden
                className={cn(
                    "ml-auto size-3.5 shrink-0 transition-transform duration-fast motion-reduce:transition-none",
                    !open && "-rotate-90",
                )}
            />
        </button>
    );
}

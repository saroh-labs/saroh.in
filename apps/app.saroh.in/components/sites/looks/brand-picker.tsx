"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { X } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { createContext, useContext } from "react";

import { useNarrow } from "@/lib/hooks/use-narrow";

/**
 * The phone's Brand sheet (DEC-185): its tabs show each set of options
 * itself, so a picker draws its options in place, with no row to open it
 * and no header of its own. False on a desk, where each opens as a
 * popover beside its row.
 */
export const BrandInline = createContext(false);

/**
 * One of the Brand tab's pickers (look, typeface, a colour): opened from
 * its row's button as a popover beside the rail on a desk; in the phone's
 * Brand sheet, its options drawn in place. Escape closes the popover.
 */
export function BrandPicker({
    open,
    onOpenChange,
    title,
    trigger,
    header,
    className,
    children,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Its name: the popover's label, the group's in the sheet. */
    title: string;
    /** The row's button that opens it. */
    trigger: ReactElement<{ onClick?: () => void }>;
    /** A desk header, with its own Close. */
    header?: ReactNode;
    className?: string;
    children: ReactNode;
}) {
    const inline = useContext(BrandInline);
    // Beside the rail on a desk; under its row where there is no room beside.
    const narrow = useNarrow();

    if (inline) {
        return (
            <div
                role="group"
                aria-label={title}
                data-brand-picker=""
                className="flex min-h-0 flex-col"
            >
                {children}
            </div>
        );
    }

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            <PopoverContent
                side={narrow ? "bottom" : "right"}
                align="start"
                collisionPadding={12}
                aria-label={title}
                data-brand-picker=""
                // The keyboard starts on the choice in force, or the search.
                onOpenAutoFocus={(e) => {
                    const start = (
                        e.currentTarget as HTMLElement
                    ).querySelector<HTMLElement>(
                        'input, [role="radio"][tabindex="0"]',
                    );
                    if (!start) return;
                    e.preventDefault();
                    start.focus();
                }}
                className={cn(
                    "flex max-h-[min(80vh,var(--radix-popover-content-available-height))] flex-col overflow-hidden rounded-xl p-0",
                    className,
                )}
            >
                {header}
                {children}
            </PopoverContent>
        </Popover>
    );
}

/** A desk picker's header: its name, a quiet line, and Close. */
export function PickerHeader({
    title,
    note,
    onClose,
}: {
    title: string;
    note?: string;
    onClose: () => void;
}) {
    // The sheet's tab names it.
    if (useContext(BrandInline)) return null;
    return (
        <div className="flex shrink-0 items-center gap-2 border-b px-3.5 py-2.5">
            <b className="flex-1 text-sm font-semibold">{title}</b>
            {note ? (
                <span className="text-xs text-muted-foreground">{note}</span>
            ) : null}
            <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Close"
                onClick={onClose}
            >
                <X aria-hidden className="size-4" />
            </Button>
        </div>
    );
}

/** A picker's foot: the group's mark, a refusal, a reason, a hint. */
export function PickerFoot({ children }: { children: ReactNode }) {
    return (
        <div className="shrink-0 space-y-1 border-t bg-muted/40 px-3 py-2.5 text-xs leading-normal text-muted-foreground">
            {children}
        </div>
    );
}

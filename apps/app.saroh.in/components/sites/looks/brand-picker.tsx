"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { ChevronLeft, X } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import {
    cloneElement,
    createContext,
    useContext,
    useEffect,
    useRef,
} from "react";
import { createPortal } from "react-dom";

import { useNarrow } from "@/lib/hooks/use-narrow";

/**
 * Where the Brand tab's pickers open on a phone: inside the rail's own
 * sheet, over the rail, never a second sheet (Brand tab, 22 Oct). Null on
 * a desk, where each opens as a popover beside its row.
 */
export const PickerHost = createContext<HTMLElement | null>(null);

/**
 * One of the Brand tab's pickers (look, typeface, a colour): opened from
 * its row's button, as a popover beside the rail on a desk, or pushed into
 * the phone's sheet with Back and its title. Escape closes it either way.
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
    /** Its name: the popover's label, the sheet's heading. */
    title: string;
    /** The row's button that opens it. */
    trigger: ReactElement<{ onClick?: () => void }>;
    /** A desk header, with its own Close; the sheet has Back instead. */
    header?: ReactNode;
    className?: string;
    children: ReactNode;
}) {
    const host = useContext(PickerHost);
    const opener = useRef<HTMLElement | null>(null);
    // Beside the rail on a desk; under its row where there is no room beside.
    const narrow = useNarrow();

    // In the sheet, the keyboard goes back to the row it came from.
    useEffect(() => {
        if (!host) return;
        if (open) {
            opener.current = document.activeElement as HTMLElement | null;
            return;
        }
        if (opener.current?.isConnected) opener.current.focus();
        opener.current = null;
    }, [open, host]);

    if (host) {
        return (
            <>
                {cloneElement(trigger, { onClick: () => onOpenChange(true) })}
                {open
                    ? createPortal(
                          <div
                              role="dialog"
                              aria-label={title}
                              data-brand-picker=""
                              onKeyDown={(e) => {
                                  // Back, not the whole sheet.
                                  if (e.key !== "Escape") return;
                                  e.stopPropagation();
                                  e.preventDefault();
                                  onOpenChange(false);
                              }}
                              className="absolute inset-0 z-10 flex flex-col bg-background"
                          >
                              <div className="flex shrink-0 items-center px-2 py-1">
                                  <Button
                                      type="button"
                                      variant="ghost"
                                      autoFocus
                                      className="h-11 gap-1 px-2"
                                      onClick={() => onOpenChange(false)}
                                  >
                                      <ChevronLeft aria-hidden />
                                      Back
                                  </Button>
                                  <h3 className="mr-[72px] flex-1 text-center text-base font-semibold">
                                      {title}
                                  </h3>
                              </div>
                              <div className="flex min-h-0 flex-1 flex-col">
                                  {children}
                              </div>
                          </div>,
                          host,
                      )
                    : null}
            </>
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
    const host = useContext(PickerHost);
    // The sheet says the title beside Back.
    if (host) return null;
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

"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetDescription,
    SheetTitle,
    SheetTrigger,
} from "@saroh/ui/sheet";
import { X } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { useRef, useState } from "react";

import { usePhone } from "./use-phone";

const CLOSE =
    "grid shrink-0 cursor-pointer place-items-center rounded-[8px] text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-accent-active";

/**
 * Where header C's three choices open (U2): a sheet that rises from the
 * foot of a phone, and a popover under its button on the desk, with the
 * same title, body and foot (BKMBookingsDay*, BKDCalendarDay). Either way
 * focus moves in and stays there, Escape and Close shut it, and focus goes
 * back to the button that opened it.
 *
 * `trigger` is the one button that opens it: the date title, the person
 * chip or "…". It is wrapped as Radix's trigger, so it says it opens a
 * dialog and whether it is open.
 */
export function HeaderOverlay({
    open,
    onOpenChange,
    trigger,
    title,
    subtitle,
    footer,
    width,
    align = "start",
    half = false,
    children,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    trigger: ReactElement;
    title: string;
    /** The line under the title: the day, or what the view holds. None:
     *  the title stands alone (the Calendar's What to show, U13). */
    subtitle?: string;
    footer?: ReactNode;
    /** The popover's width on the desk, in px (the boards': 360–380). */
    width: number;
    align?: "start" | "end";
    /**
     * On a phone, open half way (BKVCalendarBPhone's Vaul drawers): the
     * handle drags (or a tap on it moves) to the full height and back,
     * and down from half closes it. The foot stays pinned either way.
     */
    half?: boolean;
    children: ReactNode;
}) {
    const phone = usePhone();
    const [full, setFull] = useState(false);
    const dragFrom = useRef<number | null>(null);
    // Every opening starts at half again.
    const change = (o: boolean) => {
        if (!o) setFull(false);
        onOpenChange(o);
    };

    if (phone) {
        return (
            <Sheet open={open} onOpenChange={change}>
                <SheetTrigger asChild>{trigger}</SheetTrigger>
                <SheetContent
                    side="bottom"
                    closeButton={false}
                    data-header-sheet=""
                    // No line under the title: Radix is told there is none.
                    {...(subtitle ? {} : { "aria-describedby": undefined })}
                    data-snap={half ? (full ? "full" : "half") : undefined}
                    className={cn(
                        "flex max-h-[calc(100dvh-40px)] flex-col gap-0 rounded-t-[18px] border-0 bg-card p-0 shadow-xl",
                        half &&
                            "transition-[max-height,height] duration-base ease-out motion-reduce:transition-none",
                        half &&
                            (full ? "h-[calc(100dvh-40px)]" : "max-h-[55dvh]"),
                    )}
                >
                    {half ? (
                        <button
                            type="button"
                            data-snap-handle=""
                            aria-label={full ? "Show less" : "Show all"}
                            onClick={() => setFull((f) => !f)}
                            onPointerDown={(e) => {
                                dragFrom.current = e.clientY;
                            }}
                            onPointerUp={(e) => {
                                const from = dragFrom.current;
                                dragFrom.current = null;
                                if (from === null) return;
                                const moved = e.clientY - from;
                                if (moved < -24) setFull(true);
                                else if (moved > 24) {
                                    if (full) setFull(false);
                                    else change(false);
                                }
                            }}
                            className="mx-auto flex h-6 w-16 shrink-0 cursor-grab touch-none items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <span className="h-[5px] w-10 rounded-full bg-border" />
                        </button>
                    ) : (
                        <span
                            aria-hidden
                            className="mx-auto mt-2 h-[5px] w-10 shrink-0 rounded-full bg-border"
                        />
                    )}
                    <div className="relative shrink-0 py-3 pl-5 pr-[60px]">
                        <SheetTitle className="text-[18px] leading-tight">
                            {title}
                        </SheetTitle>
                        {subtitle ? (
                            <SheetDescription className="text-[13px]">
                                {subtitle}
                            </SheetDescription>
                        ) : null}
                        <SheetClose
                            aria-label="Close"
                            className={cn(
                                CLOSE,
                                "absolute right-2 top-1.5 size-11",
                            )}
                        >
                            <X aria-hidden className="size-[18px]" />
                        </SheetClose>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-1">
                        {children}
                    </div>
                    {footer ? (
                        <div className="grid shrink-0 gap-2 border-t border-border px-5 pb-[22px] pt-3">
                            {footer}
                        </div>
                    ) : null}
                </SheetContent>
            </Sheet>
        );
    }

    return (
        <Popover open={open} onOpenChange={onOpenChange} modal>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            <PopoverContent
                // The shared popover is a dialog already; it is named here.
                aria-label={title}
                align={align}
                sideOffset={6}
                collisionPadding={16}
                data-header-popover=""
                style={{ width }}
                className="flex max-h-[min(740px,var(--radix-popover-content-available-height))] max-w-[calc(100vw-32px)] flex-col rounded-[14px] border-border bg-card p-0 shadow-xl"
            >
                <div className="flex shrink-0 items-start gap-2 px-4 pb-2 pt-3.5">
                    <span className="min-w-0 flex-1">
                        <span className="block font-display text-[17px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
                            {title}
                        </span>
                        {subtitle ? (
                            <span className="block text-[12.5px] text-muted-foreground">
                                {subtitle}
                            </span>
                        ) : null}
                    </span>
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Close"
                        onClick={() => onOpenChange(false)}
                        className={cn(CLOSE, "size-9")}
                    >
                        <X aria-hidden className="size-4" />
                    </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3.5 pt-1">
                    {children}
                </div>
                {footer ? (
                    <div className="flex shrink-0 gap-2 border-t border-border px-4 py-2.5">
                        {footer}
                    </div>
                ) : null}
            </PopoverContent>
        </Popover>
    );
}

"use client";

import { cn } from "@saroh/ui/lib/utils";
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from "@saroh/ui/sheet";
import { X } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { useEffect, useState } from "react";

import { useNarrow } from "@/lib/hooks/use-narrow";

const CLOSE =
    "grid shrink-0 cursor-pointer place-items-center rounded-[8px] text-foreground transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-accent-active";

/**
 * Where Hours and time off's own sheets open (U17, BKMHoursV2*, BKDHours):
 * a sheet that rises from the foot of a phone, and a right-hand panel on
 * the desk — a phone bottom sheet is a desk side panel. Its controls save
 * as they are changed, each with a toast and Undo (DEC-170), so there is
 * nothing to Save or Cancel: "Done" at the top closes it (`done`). One that
 * only reads or picks (whose hours, why a time isn't offered) closes with
 * the ✕ instead, and one with its own last step (Remove this time off)
 * puts it in `foot`.
 *
 * Escape, the backdrop and Done or ✕ close it; the keyboard moves in and
 * goes back to what opened it. It is not `FormSheet`: that frame's Save and
 * Cancel are for a draft, and these hold none (`overlay-frames.test.ts`
 * lists it with why).
 */
export function HoursPanel({
    open,
    onClose,
    title,
    sub,
    done = true,
    tall = false,
    foot,
    children,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    /** The line under the title, always. */
    sub?: ReactNode;
    /** "Done" at the top (it saves as it goes); false for the ✕. */
    done?: boolean;
    /** Nearly the phone's whole height: the day and its time picker. */
    tall?: boolean;
    foot?: ReactNode;
    children: ReactNode;
}) {
    const phone = useNarrow();
    // What had the keyboard when it opened gets it back when it goes, as
    // the panel is taken off the page rather than closed in place.
    const [opener] = useState(() =>
        typeof document === "undefined"
            ? null
            : (document.activeElement as HTMLElement | null),
    );
    useEffect(
        () => () => {
            setTimeout(() => {
                if (opener?.isConnected) opener.focus();
            }, 0);
        },
        [opener],
    );
    return (
        <Sheet open={open} onOpenChange={(o) => (o ? null : onClose())}>
            <SheetContent
                side={phone ? "bottom" : "right"}
                closeButton={false}
                data-hours-panel=""
                {...(sub ? {} : { "aria-describedby": undefined })}
                className={cn(
                    "flex w-full flex-col gap-0 border-0 bg-card p-0 shadow-xl print:hidden",
                    phone
                        ? cn(
                              "rounded-t-[18px]",
                              tall
                                  ? "h-[calc(100dvh-12px)]"
                                  : "max-h-[calc(100dvh-40px)]",
                          )
                        : "sm:max-w-md",
                )}
            >
                {phone ? (
                    <span
                        aria-hidden
                        className="mx-auto mt-2 h-[5px] w-10 shrink-0 rounded-full bg-border"
                    />
                ) : null}
                <div
                    className={cn(
                        "relative shrink-0 py-3 pl-5",
                        done ? "pr-[84px]" : "pr-[60px]",
                        !phone && "pt-5",
                    )}
                >
                    <SheetTitle className="font-display text-[18px] font-semibold leading-tight tracking-[-0.02em]">
                        {title}
                    </SheetTitle>
                    {sub ? (
                        <SheetDescription className="mt-0.5 text-[13px] text-muted-foreground">
                            {sub}
                        </SheetDescription>
                    ) : null}
                    {done ? (
                        <SheetClose
                            className={cn(
                                CLOSE,
                                "absolute right-2 h-11 px-3 text-[15px] font-semibold",
                                phone ? "top-2" : "top-4",
                            )}
                        >
                            Done
                        </SheetClose>
                    ) : (
                        <SheetClose
                            aria-label="Close"
                            className={cn(
                                CLOSE,
                                "absolute right-2 size-11",
                                phone ? "top-1.5" : "top-3.5",
                            )}
                        >
                            <X aria-hidden className="size-[18px]" />
                        </SheetClose>
                    )}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-1">
                    {children}
                </div>
                {foot ? (
                    <div className="grid shrink-0 gap-2 border-t border-border bg-card px-5 pb-[22px] pt-3">
                        {foot}
                    </div>
                ) : null}
            </SheetContent>
        </Sheet>
    );
}

/** A group of rows in a sheet: the white box with hairlines between. */
export function PanelGroup({
    className,
    children,
    ...rest
}: HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "mt-3 overflow-hidden rounded-[12px] border border-border bg-card [&>*:last-child]:border-b-0",
                className,
            )}
            {...rest}
        >
            {children}
        </div>
    );
}

/** A small label over a part of a sheet ("Also use these hours on"). */
export function PanelLabel({
    id,
    className,
    children,
}: {
    id?: string;
    className?: string;
    children: ReactNode;
}) {
    return (
        <div
            id={id}
            className={cn(
                "mb-2 mt-[18px] text-[13px] font-semibold",
                className,
            )}
        >
            {children}
        </div>
    );
}

"use client";

import { cn } from "@saroh/ui/lib/utils";
import { ChevronRight, Clock } from "lucide-react";
import type { ComponentPropsWithRef } from "react";

import type { PhoneNext } from "@/lib/home/phone-home";

/**
 * The phone Home's Next line (DEC-171, plan U17, board `HPHome`): what
 * comes next today and how much is after it, on a tinted band. One button
 * that opens the day sheet; the props are Radix's, passed through so the
 * sheet can open from it and give focus back to it.
 */
export function PhoneNextLine({
    next,
    className,
    ...props
}: { next: PhoneNext } & ComponentPropsWithRef<"button">) {
    return (
        <button
            type="button"
            data-phone-next=""
            {...props}
            className={cn(
                "flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-[14px] border-0 bg-muted py-2 pl-3.5 pr-3 text-left text-foreground transition-colors duration-fast hover:bg-accent active:bg-accent-active",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                className,
            )}
        >
            {/* The board tints it Saffron; Saffron is the menu's marker alone
                (shared-pieces.test.ts), so it is the line's own ink. */}
            <Clock
                aria-hidden
                className="size-[18px] shrink-0 text-neutral-700 dark:text-muted-foreground"
            />
            <span className="grid min-w-0 flex-1 gap-px text-sm">
                <b className="font-semibold [overflow-wrap:anywhere]">
                    {next.title}
                </b>
                {next.sub ? (
                    <small className="text-[12.5px] text-muted-foreground">
                        {next.sub}
                    </small>
                ) : null}
            </span>
            <ChevronRight
                aria-hidden
                className="size-[18px] shrink-0 text-muted-foreground"
            />
        </button>
    );
}

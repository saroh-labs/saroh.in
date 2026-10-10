"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as React from "react";
import { cn } from "../../lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
    React.ElementRef<typeof TooltipPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
    <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
            ref={ref}
            sideOffset={sideOffset}
            className={cn(
                "z-50 max-w-[260px] overflow-hidden rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium leading-[1.4] text-primary-foreground shadow-md duration-base ease-out animate-in fade-in-0 data-[state=closed]:duration-fast data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
                className,
            )}
            {...props}
        />
    </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export interface TipProps {
    /** What the control is or does, in a few words. Nothing renders without it. */
    label: React.ReactNode;
    /** One element that takes a ref: a button, a link. */
    children: React.ReactElement;
    side?: "top" | "right" | "bottom" | "left";
    align?: "start" | "center" | "end";
}

/**
 * A tooltip in one tag, in place of `title=`: it shows on hover AND on
 * keyboard focus, in the product's own type, and it is not read twice by a
 * screen reader when the control already has that name.
 *
 * It is a hint, never the only place something is said: a thumb has no
 * hover, so a touch screen never sees it. An icon-only control carries its
 * name itself (`IconButton`'s `label`); a reason a control is off is written
 * beside it.
 */
export function Tip({ label, children, side = "top", align }: TipProps) {
    if (label === undefined || label === null || label === "") return children;
    return (
        <TooltipProvider delayDuration={350} skipDelayDuration={150}>
            <Tooltip>
                {/* The hint is the control's description too, so a screen
                    reader hears it without a hover, and a test can read it. */}
                <TooltipTrigger
                    asChild
                    aria-description={
                        typeof label === "string" ? label : undefined
                    }
                >
                    {children}
                </TooltipTrigger>
                <TooltipContent side={side} align={align}>
                    {label}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };

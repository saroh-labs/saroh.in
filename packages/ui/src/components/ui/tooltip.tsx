"use client";

import { Slot } from "@radix-ui/react-slot";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as React from "react";
import { flushSync } from "react-dom";
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

export interface TipProps extends Omit<
    React.HTMLAttributes<HTMLElement>,
    "children"
> {
    /** Handed down by a trigger this stands under, for the control. */
    ref?: React.Ref<HTMLButtonElement>;
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
 *
 * It can stand between a trigger and its control
 * (`<DropdownMenuTrigger asChild><Tip …><Button /></Tip>`): whatever the
 * trigger hands down (its ref, its handlers, its state) goes on to the
 * control. Dropped here, the menu never opened.
 *
 * It is not a thing to close. Escape, with the hint showing, belongs to
 * the sheet, dialog or menu the control sits in (`Hint`).
 */
export function Tip({
    label,
    children,
    side = "top",
    align,
    ...handed
}: TipProps) {
    if (label === undefined || label === null || label === "") {
        return Object.keys(handed).length ? (
            <Slot {...handed}>{children}</Slot>
        ) : (
            children
        );
    }
    return (
        <Hint label={label} side={side} align={align} handed={handed}>
            {children}
        </Hint>
    );
}

function Hint({
    label,
    children,
    side,
    align,
    handed,
}: Pick<TipProps, "label" | "children" | "side" | "align"> & {
    handed: Omit<TipProps, "label" | "children" | "side" | "align">;
}) {
    const [open, setOpen] = React.useState(false);
    const [dropped, setDropped] = React.useState(false);
    // Radix gives Escape to the topmost layer alone, and a hint that is
    // showing is one: with the keyboard on a control that has a hint, the
    // first Escape closed the hint and the sheet stayed open. So the hint
    // is taken off the page before Radix looks (the window hears a key
    // before the document does), outright rather than through its fade,
    // which would keep it the topmost layer until it finished.
    React.useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            flushSync(() => {
                setDropped(true);
                setOpen(false);
            });
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [open]);
    return (
        <TooltipProvider delayDuration={350} skipDelayDuration={150}>
            <Tooltip
                open={open}
                onOpenChange={(next) => {
                    if (next) setDropped(false);
                    setOpen(next);
                }}
            >
                {/* The hint is the control's description too, so a screen
                    reader hears it without a hover, and a test can read it. */}
                <TooltipTrigger
                    asChild
                    aria-description={
                        typeof label === "string" ? label : undefined
                    }
                    {...handed}
                >
                    {children}
                </TooltipTrigger>
                {dropped ? null : (
                    <TooltipContent side={side} align={align}>
                        {label}
                    </TooltipContent>
                )}
            </Tooltip>
        </TooltipProvider>
    );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };

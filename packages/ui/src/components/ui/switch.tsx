"use client";

import * as SwitchPrimitives from "@radix-ui/react-switch";
import * as React from "react";
import { cn } from "../../lib/utils";

/**
 * On or off, taking effect as it is flipped.
 *
 * Two sizes: the default (24px track) for a settings row, and `sm` (20px)
 * for a dense list or a table row. Under a finger an unseen area around
 * either takes the tap, 44px tall and wide, so the track keeps its size in
 * the row it was laid out in.
 *
 * The thumb moves on the motion tokens and carries no shadow: the track's
 * colour is what separates them. Disabled is the disabled tokens (a grey
 * track with an edge and a grey thumb), never a fade, and its position
 * still says on or off.
 */
const Switch = React.forwardRef<
    React.ElementRef<typeof SwitchPrimitives.Root>,
    React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> & {
        size?: "default" | "sm";
    }
>(({ className, size = "default", ...props }, ref) => (
    <SwitchPrimitives.Root
        data-size={size}
        className={cn(
            "group peer relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent ring-offset-background transition-colors duration-fast ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:!bg-disabled disabled:shadow-[inset_0_0_0_1px_hsl(var(--disabled-border))] data-[state=checked]:bg-primary data-[state=unchecked]:bg-input hover:data-[state=checked]:bg-primary-hover hover:data-[state=unchecked]:bg-muted-foreground active:data-[state=checked]:bg-primary-active coarse:after:absolute coarse:after:content-['']",
            size === "sm"
                ? "h-5 w-9 coarse:after:-inset-x-1.5 coarse:after:-inset-y-3.5"
                : "h-6 w-11 coarse:after:-inset-x-0.5 coarse:after:-inset-y-3",
            className,
        )}
        {...props}
        ref={ref}
    >
        <SwitchPrimitives.Thumb
            className={cn(
                "pointer-events-none block rounded-full bg-background ring-0 transition-transform duration-base ease-out group-disabled:bg-disabled-foreground data-[state=unchecked]:translate-x-0",
                size === "sm"
                    ? "size-4 data-[state=checked]:translate-x-4"
                    : "size-5 data-[state=checked]:translate-x-5",
            )}
        />
    </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };

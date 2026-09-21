"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import * as React from "react";
import { cn } from "../../lib/utils";

const Checkbox = React.forwardRef<
    React.ElementRef<typeof CheckboxPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
    <CheckboxPrimitive.Root
        ref={ref}
        className={cn(
            /*
             * 16px, 4px corners, a 1.5px Ink 300 edge on a white field;
             * checked is an Ink fill with a Paper tick (brand file §10, §11).
             *
             * ## Dark does not copy light here
             *
             * Light fills the box with `--field` (white) on a white card, so
             * the fill is invisible and the edge does all the work. Dark
             * inherited the same pair and both halves broke: `--field` is
             * Sunken (#0E0E0D), which is DARKER than the row it sits in, so
             * the box read as a hole punched in the table; and
             * `--border-strong` is a CARD edge, not a control one, measuring
             * 1.84:1 against that row — an outline nobody could see.
             *
             * So in dark the box sits on whatever surface it is placed on and
             * the edge lightens to `--input`, the control-boundary token,
             * which is the brand system's own "borders lighten on dark" rule
             * doing the work the fill was failing to do.
             */
            "group peer size-4 shrink-0 rounded-[4px] border-[1.5px] border-border-strong bg-field ring-offset-background transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=indeterminate]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:text-primary-foreground dark:border-input dark:bg-transparent dark:data-[state=checked]:border-primary dark:data-[state=indeterminate]:border-primary dark:data-[state=checked]:bg-primary dark:data-[state=indeterminate]:bg-primary",
            className,
        )}
        {...props}
    >
        <CheckboxPrimitive.Indicator
            className={cn("flex items-center justify-center text-current")}
        >
            {/* Part of a set selected reads as a dash, not a tick: "some",
                not "all". */}
            <Check
                className="size-3 group-data-[state=indeterminate]:hidden"
                strokeWidth={3}
            />
            <Minus
                className="hidden size-3 group-data-[state=indeterminate]:block"
                strokeWidth={3}
            />
        </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };

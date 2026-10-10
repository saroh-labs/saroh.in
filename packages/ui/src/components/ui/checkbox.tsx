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
             * 16px, 4px corners, a 1.5px edge on a white field; checked is
             * an Ink fill with a Paper tick (brand file §10, §11).
             *
             * ## Dark does not copy light's fill
             *
             * Light fills the unticked box with `--field` (white) on a white
             * card, so the fill is invisible and the edge does all the work.
             * In dark the box sits on whatever surface it is placed on
             * (transparent), because a filled box there read as a hole
             * punched in the table.
             *
             * ## One resting edge, shared with the radio
             *
             * Unticked, the edge is `--input` at 1.5px in both themes: the
             * control-boundary token, 3.17:1 on a white card. It was
             * `--border-strong` in light, which is 1.96:1 there, under the
             * 3:1 a control's edge needs (WCAG 1.4.11), and the radio beside
             * it drew a different, darker one.
             *
             * ## Disabled is the disabled tokens, never a fade
             *
             * A grey box with a grey tick: fill, edge and tick from the
             * three disabled tokens, as a disabled button is drawn.
             *
             * ## 44px under a finger
             *
             * The box stays 16px, because a row of them is laid out at that
             * size. On a touch pointer an unseen area around it takes the
             * tap, 44px square.
             */
            "group peer relative size-4 shrink-0 cursor-pointer rounded-[4px] border-[1.5px] border-input ring-offset-background transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:!border-disabled-border disabled:!bg-disabled disabled:!text-disabled-foreground data-[state=checked]:border-primary data-[state=indeterminate]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:bg-primary data-[state=unchecked]:bg-field data-[state=checked]:text-primary-foreground data-[state=indeterminate]:text-primary-foreground hover:data-[state=unchecked]:border-foreground active:data-[state=unchecked]:bg-accent-active coarse:after:absolute coarse:after:-inset-4 coarse:after:content-[''] dark:data-[state=unchecked]:bg-transparent",
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

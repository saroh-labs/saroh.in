import { Slot } from "@radix-ui/react-slot";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
    /*
     * Press is a colour step, not a shrink.
     *
     * Hover moves one ramp step and pressed two, never a new hue (brand file
     * §6). That gives a touch device — the phone and the shop floor, two of the
     * four primary scenes (§18) — a visible acknowledgement under the finger,
     * which is what `active:scale-[0.97]` used to do. The scale is gone because
     * the motion rules forbid animating size alongside anything else, and a
     * colour change says "pressed" without moving the label.
     *
     * The transition names its properties rather than using `all`, at the
     * 100ms "under the finger" duration.
     *
     * DISABLED IS ONE TREATMENT, NOT FIVE. Every variant collapses to the same
     * Sunken surface and Ink 500 label — never an opacity. A disabled label
     * still clears 4.5:1: WCAG exempts disabled text and the brand declines the
     * exemption, because permissions depend on reading it. Pair a disabled
     * button with a nearby reason ("Refunds need a manager").
     *
     * AN ICON WITHOUT A SIZE IS 16PX. Lucide draws at 24px unless told
     * otherwise, and a pencil at 24 beside a 13px label reads as a mistake.
     * An icon that states its own size (`size-*`, `h-*`) keeps it.
     */
    "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-semibold [&_svg]:shrink-0 [&_svg:not([class*='size-']):not([class*='h-'])]:size-4 ring-offset-background transition-[color,background-color,border-color,text-decoration-color] duration-fast ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:border-transparent disabled:bg-disabled disabled:text-disabled-foreground",
    {
        variants: {
            variant: {
                default:
                    "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active",
                // `brand` renders the Ink control, like `default`. The Saffron
                // fill is `highlight`, and it is budgeted at one per screen;
                // 34 call sites say "brand" and turning them all Saffron would
                // spend the accent thirty-four times.
                brand: "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active",
                // "Accent · sparingly". The one action a screen exists for, in
                // Saffron with an Ink label. Pressed moves two steps, to a fill
                // dark enough that the label flips to Paper.
                highlight:
                    "bg-highlight text-highlight-foreground hover:bg-highlight-hover active:bg-highlight-active active:text-highlight-active-foreground",
                success:
                    "bg-success text-success-foreground hover:bg-success/90",
                destructive:
                    "bg-destructive text-destructive-foreground hover:bg-destructive-hover active:bg-destructive-active",
                // The brand file's "Secondary": a raised surface with a visible
                // edge. The edge darkens a step on hover; the fill steps with it.
                outline:
                    "border border-border bg-card text-card-foreground hover:border-border-strong hover:bg-accent hover:text-accent-foreground active:border-border-strong active:bg-accent-active",
                secondary:
                    "bg-secondary text-secondary-foreground hover:bg-secondary-hover active:bg-accent-active",
                ghost: "hover:bg-accent hover:text-accent-foreground active:bg-accent-active",
                // Ink, not Saffron: in the product the accent belongs to the active
                // state and nothing else, and a link is not a state.
                link: "text-primary underline-offset-4 hover:underline disabled:bg-transparent",
            },
            /*
             * 32 / 38 / 45 — small for toolbars and bulk-action bars, medium
             * everywhere by default, large for marketing calls to action.
             * Height is set explicitly, not derived from padding, so a bordered
             * and a borderless button at the same size match. Nothing is
             * smaller than 32px.
             *
             * `coarse:` is a touch pointer — the phone and the shop floor. Every
             * size grows to at least 44px there and keeps its desk height under
             * a mouse. A media query, not a breakpoint: width says how much
             * room there is, not what is doing the pointing.
             */
            size: {
                default: "h-[38px] px-4 coarse:h-11",
                sm: "h-8 px-3 text-[0.8125rem] coarse:h-11 coarse:px-4 coarse:text-sm",
                lg: "h-[45px] px-[22px] text-[0.9375rem] coarse:h-12",
                icon: "h-[38px] w-[38px] coarse:h-11 coarse:w-11",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    },
);

export interface ButtonProps
    extends
        React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {
    asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : "button";
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        );
    },
);
Button.displayName = "Button";

export { Button, buttonVariants };

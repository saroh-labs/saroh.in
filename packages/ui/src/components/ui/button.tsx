import { Slot } from "@radix-ui/react-slot";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variant: {
                default:
                    "bg-primary text-primary-foreground hover:bg-primary/90",
                // `brand` and `highlight` both render the filled control, and in
                // the monochrome register that is the SAME control: a near-black
                // fill on a light page, inverted in dark.
                //
                // They deliberately do not use `bg-brand`. `--brand` is the
                // interactive BLUE — links, focus rings, emphasis — and a
                // monochrome system cannot have one token be both the link
                // colour and the button fill without every CTA turning blue.
                // Filled buttons take `--primary`; blue stays for things you
                // click through, not things you press.
                //
                // The two names are kept apart because call sites use them to
                // say something different — "the brand action" vs "the one
                // action this screen exists for" — and a palette that
                // reintroduces a coloured CTA would want them to diverge again.
                brand: "bg-primary text-primary-foreground hover:bg-primary/90",
                highlight:
                    "bg-primary text-primary-foreground hover:bg-primary/90",
                success:
                    "bg-success text-success-foreground hover:bg-success/90",
                destructive:
                    "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                outline:
                    "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
                secondary:
                    "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                ghost: "hover:bg-accent hover:text-accent-foreground",
                link: "text-primary underline-offset-4 hover:underline",
            },
            // 32 / 40 / 48 — the Geist control heights. `sm` was 36px and `lg`
            // 44px, which put every button between two steps and made dense
            // toolbars sit oddly against 40px inputs.
            size: {
                default: "h-10 px-4 py-2",
                sm: "h-8 rounded-md px-3 text-[0.8125rem]",
                lg: "h-12 rounded-md px-6",
                icon: "h-10 w-10",
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

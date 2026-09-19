import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
    // `font-medium`, not semibold: at 12px a semibold label reads as shouting,
    // and badges here mark state ("Disabled", "Setup required") rather than
    // demanding attention.
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
    {
        variants: {
            variant: {
                default:
                    "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
                secondary:
                    "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
                destructive:
                    "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
                outline: "text-foreground",
                /*
                 * Two label classes, told apart by shape before colour says
                 * anything (brand file §7). STATE is a filled pill the code
                 * owns: the status hue mixed into the page, with its 700 cut
                 * as text, and the status always said in words — colour is
                 * reinforcement, never the signal. KIND is `tag`: an outline
                 * category a shop owner invents, which is exactly why it cannot
                 * carry designed meaning and stays neutral.
                 *
                 * `draft` is Saffron: something unfinished that is yours.
                 */
                success:
                    "border-transparent bg-success-subtle text-success-subtle-foreground",
                warning:
                    "border-transparent bg-warning-subtle text-warning-subtle-foreground",
                error: "border-transparent bg-destructive-subtle text-destructive-subtle-foreground",
                info: "border-transparent bg-info-subtle text-info-subtle-foreground",
                draft: "border-transparent bg-brand-subtle text-brand-subtle-foreground",
                tag: "rounded border-border-strong bg-transparent text-foreground",
                // A state with no hue of its own: cancelled, archived, not
                // connected. Present, but asking nothing of anyone.
                neutral: "border-border bg-transparent text-muted-foreground",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    },
);

export interface BadgeProps
    extends
        React.HTMLAttributes<HTMLDivElement>,
        VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
    return (
        <div className={cn(badgeVariants({ variant }), className)} {...props} />
    );
}

export { Badge, badgeVariants };

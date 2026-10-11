import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
    // `font-medium`, not semibold: at 12px a semibold label reads as shouting,
    // and badges here mark state ("Disabled", "Setup required") rather than
    // demanding attention.
    //
    // A badge says something; it is not pressed. So it has no hover, no focus
    // ring and no transition: a state that reacts to the pointer reads as a
    // button. Put it inside a link or button when it should be one.
    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium",
    {
        variants: {
            // 12px by default; `sm` (11px) for a dense row or beside a title.
            size: {
                default: "px-2.5 py-0.5 text-xs",
                sm: "px-2 py-px text-[11px] leading-[1.45]",
            },
            variant: {
                default:
                    "border-transparent bg-primary text-primary-foreground",
                secondary:
                    "border-transparent bg-secondary text-secondary-foreground",
                destructive:
                    "border-transparent bg-destructive text-destructive-foreground",
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
                 * `draft` is neutral with a dashed edge: something unfinished
                 * that is yours. It was Saffron until the accent was kept for
                 * the menu's marker and one highlighted action.
                 */
                success:
                    "border-transparent bg-success-subtle text-success-subtle-foreground",
                warning:
                    "border-transparent bg-warning-subtle text-warning-subtle-foreground",
                error: "border-transparent bg-destructive-subtle text-destructive-subtle-foreground",
                info: "border-transparent bg-info-subtle text-info-subtle-foreground",
                draft: "border-dashed border-border-strong bg-transparent text-neutral-600 dark:text-muted-foreground",
                // In play and yours to act on (a new order, a booking not
                // yet confirmed, an open lead): a solid Ink edge. It was a
                // Saffron tint; the accent is the menu's marker now.
                active: "border-foreground bg-transparent text-foreground",
                tag: "rounded border-border-strong bg-transparent text-foreground",
                // A state with no hue of its own: cancelled, archived, not
                // connected. Present, but asking nothing of anyone.
                // Filled Sunken with Ink 600, as the brand file draws
                // "Refunded": present, and asking nothing of anyone. Ink 600
                // is a light-mode cut — on dark Sunken it read at under 2:1 —
                // so dark takes the muted-foreground token instead.
                neutral:
                    "border-transparent bg-muted text-neutral-600 dark:text-muted-foreground",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    },
);

export interface BadgeProps
    extends
        React.HTMLAttributes<HTMLSpanElement>,
        VariantProps<typeof badgeVariants> {
    /**
     * A 6px dot before the words, in the badge's own colour: a second cue
     * beside the tint, for bright light and for anyone who can't tell the
     * hues apart. The words still say the status.
     */
    dot?: boolean;
}

/**
 * A `span`, so it can sit inside a sentence, a heading or a table cell.
 * Sentence case, always: "Paid", never "PAID".
 */
function Badge({
    className,
    variant,
    size,
    dot = false,
    children,
    ...props
}: BadgeProps) {
    return (
        <span
            className={cn(badgeVariants({ variant, size }), className)}
            {...props}
        >
            {dot ? (
                <span
                    aria-hidden
                    data-badge-dot=""
                    className="size-1.5 shrink-0 rounded-full bg-current"
                />
            ) : null}
            {children}
        </span>
    );
}

export { Badge, badgeVariants };

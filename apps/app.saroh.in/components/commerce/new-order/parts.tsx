import { cn } from "@saroh/ui/lib/utils";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * The New order sheet's shared pieces (B13), drawn to the design's
 * "Saroh Orders Screen": a card per step with an uppercase eyebrow.
 */

/** Focus ring every control in the sheet shares. */
export const FOCUS =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

/** The sheet's inputs: 38px, 8px corners, 13.5px text. */
export const FIELD = "h-[38px] rounded-lg bg-card px-2.5 text-[13.5px]";

/** A small bordered button: "Change", "−", "+". */
export const SMALL_BUTTON = cn(
    FOCUS,
    "cursor-pointer rounded-lg border border-border bg-card font-semibold text-foreground transition-colors duration-fast hover:border-border-strong hover:bg-muted active:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-50",
);

export function StepCard({
    title,
    aside,
    children,
    className,
    ...props
}: ComponentPropsWithoutRef<"section"> & {
    title: string;
    /** Beside the title, on the right ("3 items"). */
    aside?: ReactNode;
}) {
    return (
        <section
            aria-label={title}
            className={cn(
                "rounded-xl border border-border bg-card px-3.5 py-[13px]",
                className,
            )}
            {...props}
        >
            <div className="mb-2 flex items-baseline">
                <h3 className="flex-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    {title}
                </h3>
                {aside ? (
                    <span className="text-[12px] text-muted-foreground">
                        {aside}
                    </span>
                ) : null}
            </div>
            {children}
        </section>
    );
}

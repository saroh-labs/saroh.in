import { cn } from "@saroh/ui/lib/utils";
import type { ComponentPropsWithoutRef } from "react";

/** A choice among a few — a radio drawn as a pill (the design's chip). */
export function Chip({
    on,
    className,
    ...props
}: ComponentPropsWithoutRef<"button"> & { on: boolean }) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={on}
            className={cn(
                "h-8 whitespace-nowrap rounded-full border px-3 text-[12.5px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled disabled:text-disabled-foreground coarse:h-11",
                // Hover one step, pressed two (brand file §6).
                on
                    ? "border-foreground bg-primary font-semibold text-primary-foreground hover:bg-primary-hover active:bg-primary-active"
                    : "border-border bg-card font-medium text-foreground hover:border-border-strong hover:bg-accent active:bg-accent-active",
                className,
            )}
            {...props}
        />
    );
}

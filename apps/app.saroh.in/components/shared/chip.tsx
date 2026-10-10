import { cn } from "@saroh/ui/lib/utils";
import type { ComponentPropsWithoutRef } from "react";

/**
 * The one chip: a choice among a few, drawn as a pill. Ink when chosen,
 * outlined when not, 32px and 44px under a thumb.
 *
 * By default it is a radio (put it in a `role="radiogroup"` with a name):
 * one of the set is chosen. `as="toggle"` is a filter that is on or off
 * (`aria-pressed`), in a `role="group"`. For a two- or three-way switch of
 * view or mode, use `Segmented` instead.
 */
/**
 * The chip's look, for a chip that has to be another element: a link whose
 * choice is an address, a `label` around a hidden input. Prefer `Chip`.
 */
export function chipClass(on: boolean, className?: string) {
    return cn(
        "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] transition-colors duration-fast ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:border-border disabled:bg-disabled disabled:text-disabled-foreground coarse:h-11",
        // Hover one step, pressed two (brand file §6).
        on
            ? "border-foreground bg-primary font-semibold text-primary-foreground hover:bg-primary-hover active:bg-primary-active"
            : "border-border bg-card font-medium text-foreground hover:border-border-strong hover:bg-accent active:bg-accent-active",
        className,
    );
}

export function Chip({
    on,
    as = "radio",
    className,
    ...props
}: ComponentPropsWithoutRef<"button"> & {
    on: boolean;
    as?: "radio" | "toggle";
}) {
    return (
        <button
            type="button"
            {...(as === "radio"
                ? { role: "radio", "aria-checked": on }
                : { "aria-pressed": on })}
            className={chipClass(on, className)}
            {...props}
        />
    );
}

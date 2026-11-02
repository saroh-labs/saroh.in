import type { ComponentProps } from "react";

/** A choice shown in the open: inverted to Ink when on. 44px to tap on a phone. */
export function Chip({
    on = false,
    className = "",
    ...props
}: ComponentProps<"button"> & { on?: boolean }) {
    return (
        <button
            type="button"
            aria-pressed={on}
            className={`inline-flex h-11 cursor-pointer items-center rounded-full border px-3 text-sm md:h-8 ${
                on
                    ? "border-ink bg-ink text-paper"
                    : "border-control bg-surface text-ink"
            } ${className}`}
            {...props}
        />
    );
}

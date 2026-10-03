import { cn } from "@/lib/cn";
import type { ElementType, HTMLAttributes } from "react";

/**
 * The page column: at most 1280px, centred, with the design's gutters,
 * `clamp(20px, 5vw, 56px)`. Every V2 section sits in one.
 */
export function Container({
    as: Tag = "div",
    className,
    ...props
}: HTMLAttributes<HTMLElement> & { as?: ElementType }) {
    return (
        <Tag
            className={cn(
                "mx-auto w-full max-w-mk-page px-mk-gutter",
                className,
            )}
            {...props}
        />
    );
}

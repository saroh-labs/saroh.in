import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

/** The design's eyebrow: 13px Geist 600, uppercase at 0.12em, Saffron 700. */
export function Eyebrow({
    className,
    ...props
}: HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "text-mk-eyebrow font-semibold uppercase text-brand-700",
                className,
            )}
            {...props}
        />
    );
}

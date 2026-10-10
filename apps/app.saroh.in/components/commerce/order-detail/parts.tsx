import { cn } from "@saroh/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * The pieces every panel of Order Detail is drawn from, after the "Saroh
 * Order Detail" design (1d): a white card with a 12px radius, a display-face
 * title, and the one pill shape.
 */

export function Panel({
    className,
    children,
    ...rest
}: {
    className?: string;
    children: ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
    return (
        <section
            className={cn(
                "min-w-0 rounded-xl border border-border bg-card px-4 py-[13px]",
                className,
            )}
            {...rest}
        >
            {children}
        </section>
    );
}

export function PanelTitle({
    className,
    children,
    id,
}: {
    className?: string;
    children: ReactNode;
    id?: string;
}) {
    return (
        <h2
            id={id}
            className={cn(
                "font-display text-[15px] font-semibold tracking-[-0.02em]",
                className,
            )}
        >
            {children}
        </h2>
    );
}

export type PillTone = "brand" | "success" | "neutral" | "danger";

/**
 * The brand focus ring (Ink with a Paper offset, Saffron on dark) for the
 * page's own controls — the same one `Button` carries.
 */
export const FOCUS =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** The design's 38px button, in its two looks. */
export function actionClass(kind: "primary" | "ghost") {
    return cn(
        "h-[38px] rounded-[9px] px-4 text-[14px] font-semibold coarse:h-11",
        kind === "ghost" && "bg-card",
    );
}

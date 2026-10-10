import { cn } from "@saroh/ui/lib/utils";
import type { ReactNode } from "react";

import type { StepTone } from "@/lib/orders/list-row";

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
 * The step beside the order's number, as the design draws it: a 24px pill
 * in sentence case, tinted as the Orders list tints the same step — Saffron
 * waiting to start, grey under way, green ready, an outline once done, red
 * refunded or cancelled.
 */
const STEP_PILL: Record<StepTone, string> = {
    new: "border-transparent bg-brand-subtle text-brand-subtle-foreground",
    prog: "border-transparent bg-muted text-foreground",
    ready: "border-transparent bg-success-subtle text-success-subtle-foreground",
    done: "border-border bg-transparent text-muted-foreground",
    bad: "border-transparent bg-destructive-subtle text-destructive-subtle-foreground",
};

export function StatusPill({
    tone,
    children,
}: {
    tone: StepTone;
    children: ReactNode;
}) {
    return (
        <span
            className={cn(
                "inline-flex h-6 items-center whitespace-nowrap rounded-full border px-2.5 text-[12.5px] font-semibold",
                STEP_PILL[tone],
            )}
        >
            {children}
        </span>
    );
}

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

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

/**
 * A panel that opens under Items to change the order (refund, edit, courier):
 * the same card with an Ink edge, because it is the thing being worked on.
 */
export function WorkPanel({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <section
            role="region"
            aria-label={label}
            className="min-w-0 rounded-xl border border-foreground bg-card px-4 py-3.5"
        >
            {children}
        </section>
    );
}

export type PillTone = "brand" | "success" | "neutral" | "danger";

const PILL: Record<PillTone, string> = {
    brand: "bg-brand-subtle text-brand-subtle-foreground",
    success: "bg-success-subtle text-success-subtle-foreground",
    neutral: "bg-muted text-neutral-700 dark:text-muted-foreground",
    danger: "bg-destructive-subtle text-destructive-subtle-foreground",
};

/** The status beside the order's number: uppercase, 11px, a tinted fill. */
export function StatusPill({
    tone,
    children,
}: {
    tone: PillTone;
    children: ReactNode;
}) {
    return (
        <span
            className={cn(
                "whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em]",
                PILL[tone],
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

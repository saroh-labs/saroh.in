import * as React from "react";

import { cn } from "../../lib/utils";
import { Card } from "./card";

export interface StatCardProps extends Omit<
    React.HTMLAttributes<HTMLDivElement>,
    "title"
> {
    label: React.ReactNode;
    value: React.ReactNode;
    /** Optional sub-line: a delta, comparison, or unit. */
    hint?: React.ReactNode;
}

/**
 * A single dashboard metric (label + big value + optional hint), so stat grids
 * across the product (analytics, store overview, …) share one card instead of
 * bespoke markup. Compose several in a `grid`.
 */
export function StatCard({
    label,
    value,
    hint,
    className,
    ...props
}: StatCardProps) {
    return (
        // 14/16 padding and an 11px radius, as the workspace design draws a
        // stat tile.
        <Card
            className={cn("rounded-[11px] px-4 py-3.5", className)}
            {...props}
        >
            {/* An eyebrow (11px Geist 600, uppercase) over a figure in Space
                Grotesk — large figures are one of the display face's jobs. */}
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {label}
            </p>
            <p className="mt-[7px] font-display text-[25px] font-semibold tabular-nums leading-none tracking-[-0.03em]">
                {value}
            </p>
            {hint ? (
                <p className="mt-[3px] text-[11.5px] leading-[1.45] text-muted-foreground">
                    {hint}
                </p>
            ) : null}
        </Card>
    );
}

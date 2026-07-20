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
        <Card className={cn("p-5", className)} {...props}>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">
                {value}
            </p>
            {hint ? (
                <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
            ) : null}
        </Card>
    );
}

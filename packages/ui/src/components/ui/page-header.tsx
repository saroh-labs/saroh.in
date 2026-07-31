import * as React from "react";

import { cn } from "../../lib/utils";

export interface PageHeaderProps extends Omit<
    React.HTMLAttributes<HTMLDivElement>,
    "title"
> {
    title: React.ReactNode;
    description?: React.ReactNode;
    /** Trailing actions — keep to ONE primary (Button variant="brand") + optional secondary. */
    actions?: React.ReactNode;
}

/**
 * The single page-header pattern for every list/detail/settings screen, so the
 * ~35 hand-rolled `<div class="flex justify-between"><h1>…</h1></div>` headers
 * become consistent (title scale, spacing, action placement) and every page
 * answers "where am I / what can I do". Wrap the primary action in `actions`.
 */
export function PageHeader({
    title,
    description,
    actions,
    className,
    ...props
}: PageHeaderProps) {
    return (
        <div
            className={cn(
                "mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
                className,
            )}
            {...props}
        >
            <div className="space-y-1">
                {/* The display face is reserved for page-level titles. Component
                    titles (CardTitle, DialogTitle) stay on the UI face — a
                    display cut at 14px reads as noise in dense screens. */}
                <h1 className="font-display text-2xl font-semibold tracking-tight">
                    {title}
                </h1>
                {description ? (
                    <p className="text-sm text-muted-foreground">
                        {description}
                    </p>
                ) : null}
            </div>
            {actions ? (
                <div className="flex shrink-0 items-center gap-2">
                    {actions}
                </div>
            ) : null}
        </div>
    );
}

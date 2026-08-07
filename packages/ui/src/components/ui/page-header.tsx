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
                // `mb-8`, not `mb-6`: this is the one gap on every page in the
                // product, and the old value sat closer to the content than the
                // description sat to its own title — the header read as part of
                // the first row rather than as the page's own block.
                "mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
                className,
            )}
            {...props}
        >
            <div className="min-w-0">
                {/* The display face is reserved for page-level titles. Component
                    titles (CardTitle, DialogTitle) stay on the UI face — a
                    display cut at 14px reads as noise in dense screens.

                    Tracking tightens with size here to match the marketing
                    surface's ramp, so a merchant moving from saroh.in into the
                    workspace reads the same typographic voice. */}
                <h1 className="truncate font-display text-[1.625rem] font-semibold leading-[1.15] tracking-[-0.025em]">
                    {title}
                </h1>
                {description ? (
                    <p className="mt-1.5 max-w-[68ch] text-[13.5px] leading-relaxed text-muted-foreground">
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

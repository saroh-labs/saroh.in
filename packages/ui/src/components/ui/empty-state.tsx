import * as React from "react";

import { cn } from "../../lib/utils";

export interface EmptyStateProps extends Omit<
    React.HTMLAttributes<HTMLDivElement>,
    "title"
> {
    icon?: React.ReactNode;
    title: React.ReactNode;
    description?: React.ReactNode;
    /** A single primary action that teaches the next step. */
    action?: React.ReactNode;
}

/**
 * The single empty-state pattern. A good empty state TEACHES the next step, so
 * every "No X yet" surface uses the same dashed card + title + one-line guidance
 * + one primary action instead of ad-hoc markup.
 */
export function EmptyState({
    icon,
    title,
    description,
    action,
    className,
    ...props
}: EmptyStateProps) {
    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-12 text-center",
                className,
            )}
            {...props}
        >
            {icon ? (
                <div className="text-muted-foreground [&_svg]:h-8 [&_svg]:w-8">
                    {icon}
                </div>
            ) : null}
            <div className="space-y-1">
                <h2 className="text-lg font-semibold">{title}</h2>
                {description ? (
                    <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                        {description}
                    </p>
                ) : null}
            </div>
            {action}
        </div>
    );
}

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
    /**
     * Where this page sits, above the title: "Workspace › Team". The last
     * crumb is the page itself and reads in Ink; the rest are muted.
     */
    breadcrumb?: React.ReactNode[];
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
    breadcrumb,
    className,
    ...props
}: PageHeaderProps) {
    const crumbs = breadcrumb?.length ? (
        <nav
            aria-label="Breadcrumb"
            className="mb-[9px] flex items-center gap-2 text-[12px] text-muted-foreground"
        >
            {breadcrumb.map((crumb, i) => (
                <React.Fragment key={i}>
                    {i > 0 ? (
                        <svg
                            aria-hidden
                            viewBox="0 0 24 24"
                            className="size-3 shrink-0"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M9 6 L15 12 L9 18" />
                        </svg>
                    ) : null}
                    <span
                        className={cn(
                            i === breadcrumb.length - 1 && "text-foreground",
                        )}
                    >
                        {crumb}
                    </span>
                </React.Fragment>
            ))}
        </nav>
    ) : null;

    return (
        <div
            className={cn(
                // `mb-8`, not `mb-6`: this is the one gap on every page in the
                // product, and the old value sat closer to the content than the
                // description sat to its own title — the header read as part of
                // the first row rather than as the page's own block.
                "mb-8",
                className,
            )}
            {...props}
        >
            {/* The breadcrumb sits above the whole row, so the actions line
                up with the title rather than with the crumbs. */}
            {crumbs}
            <div
                className={cn(
                    "flex flex-col gap-3 sm:flex-row sm:justify-between",
                    // On the title's line when there is no description (the
                    // applied screens); on the description's last line when
                    // there is one.
                    description ? "sm:items-end" : "sm:items-center",
                )}
            >
                <div className="min-w-0">
                    {/* Space Grotesk 600 at 30px, as on the brand file's
                        applied screens. The display face runs from Display to
                        H3 and stops there; component titles (CardTitle,
                        DialogTitle) stay on Geist, because below H3 the brand
                        is the UI face. */}
                    <h1 className="truncate font-display text-[30px] font-semibold leading-[1.05] tracking-[-0.03em]">
                        {title}
                    </h1>
                    {description ? (
                        <p className="mt-1.5 max-w-[68ch] text-[13.5px] leading-relaxed text-muted-foreground">
                            {description}
                        </p>
                    ) : null}
                </div>
                {actions ? (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {actions}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

import * as React from "react";

import { cn } from "../../lib/utils";

export interface PageHeaderProps extends Omit<
    React.HTMLAttributes<HTMLDivElement>,
    "title"
> {
    title: React.ReactNode;
    description?: React.ReactNode;
    /**
     * How many the page holds, in the thing's own word ("3 bookings"), drawn
     * beside the title. The caller passes nothing at zero: the empty state
     * already says so.
     */
    count?: React.ReactNode;
    /**
     * A record's standing, beside its name: its status pill ("Paid"), and
     * any other pill that says what kind of thing it is.
     */
    badge?: React.ReactNode;
    /**
     * What stands before a record's name: its picture, initials or mark.
     * Decoration for the eye; the name is the title.
     */
    lead?: React.ReactNode;
    /**
     * What sits before the actions and is not a button: a view switch, or a
     * summary figure that is not a count ("₹12,400 owed to you").
     */
    meta?: React.ReactNode;
    /**
     * Trailing actions. The primary is LAST, a default `Button` with no icon
     * ("New booking"); secondary actions come before it.
     */
    actions?: React.ReactNode;
    /**
     * Where this page sits, above the title: "Workspace › Team". The last
     * crumb is the page itself and reads in Ink; the rest are muted.
     */
    breadcrumb?: React.ReactNode[];
}

/**
 * The one page header: breadcrumb above the title, the title at 30px with its
 * count beside it, one line of description, then meta and actions on the
 * right. Every list, detail and settings screen draws this and nothing else,
 * so "what page is this, where am I, what can I do" has one answer. A screen
 * that needs something it lacks adds a slot here rather than a header of its
 * own.
 */
export function PageHeader({
    title,
    description,
    count,
    badge,
    lead,
    meta,
    actions,
    breadcrumb,
    className,
    ...props
}: PageHeaderProps) {
    const crumbs = breadcrumb?.length ? (
        <nav
            aria-label="Breadcrumb"
            className="mb-[9px] flex min-w-0 items-center gap-2 text-[12px] text-muted-foreground [&_a:active]:text-muted-foreground [&_a:hover]:text-foreground [&_a]:rounded-sm [&_a]:transition-colors"
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
                        aria-current={
                            i === breadcrumb.length - 1 ? "page" : undefined
                        }
                        className={cn(
                            i === breadcrumb.length - 1
                                ? "min-w-0 truncate text-foreground"
                                : "shrink-0",
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
                <div
                    className={cn(
                        "min-w-0",
                        lead && "flex items-center gap-3.5",
                    )}
                >
                    {lead ? (
                        <div data-slot="page-lead" className="shrink-0">
                            {lead}
                        </div>
                    ) : null}
                    <div className="min-w-0">
                        {/* Space Grotesk 600 at 30px, as on the brand file's
                        applied screens. The display face runs from Display to
                        H3 and stops there; component titles (CardTitle,
                        DialogTitle) stay on Geist, because below H3 the brand
                        is the UI face. A long title wraps, balanced, rather
                        than being cut: on a phone it is the only place the
                        whole name is shown. */}
                        <div
                            className={cn(
                                "flex flex-wrap gap-x-2.5 gap-y-1",
                                badge ? "items-center" : "items-baseline",
                            )}
                        >
                            <h1 className="min-w-0 text-balance font-display text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] [overflow-wrap:anywhere]">
                                {title}
                            </h1>
                            {badge ? (
                                <span
                                    data-slot="page-badge"
                                    className="flex flex-wrap items-center gap-2"
                                >
                                    {badge}
                                </span>
                            ) : null}
                            {count ? (
                                <span
                                    data-slot="page-count"
                                    className="whitespace-nowrap text-[13px] tabular-nums text-muted-foreground"
                                >
                                    {count}
                                </span>
                            ) : null}
                        </div>
                        {description ? (
                            <div className="mt-1.5 max-w-[68ch] text-[13.5px] leading-relaxed text-muted-foreground">
                                {description}
                            </div>
                        ) : null}
                    </div>
                </div>
                {meta || actions ? (
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-2 sm:justify-end">
                        {meta ? (
                            <div
                                data-slot="page-meta"
                                className="flex min-w-0 flex-wrap items-center gap-2 text-[13px] text-muted-foreground"
                            >
                                {meta}
                            </div>
                        ) : null}
                        {actions ? (
                            <div
                                data-slot="page-actions"
                                className="flex shrink-0 flex-wrap items-center gap-2"
                            >
                                {actions}
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

/**
 * "3 bookings", "1 booking", and nothing at zero: the header's count in the
 * thing's own word. `null` (not read) is nothing too, never a 0.
 */
export function countLabel(
    n: number | null | undefined,
    noun: { one: string; other: string },
    locale = "en-IN",
): string | undefined {
    if (!n || n < 0) return undefined;
    return `${n.toLocaleString(locale)} ${n === 1 ? noun.one : noun.other}`;
}

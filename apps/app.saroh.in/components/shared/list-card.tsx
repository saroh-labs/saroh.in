import { cn } from "@saroh/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * The workspace design's list: one bordered card, a row of column headings,
 * then a row per item with its title, a line under it, and whatever belongs
 * on the right. Providers and Notifications draw it; the column headings are
 * what make the right-hand edge scannable as "status" or "when".
 */
export function ListCard({
    main,
    end,
    note,
    children,
    className,
}: {
    /** The left column's heading: "Provider", "Notification". */
    main: string;
    /** The right column's heading: "Status", "When". */
    end: string;
    /** A line under the card about what the list is. */
    note?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className={className}>
            <div className="overflow-hidden rounded-[12px] border border-border">
                <div
                    aria-hidden
                    className="flex items-center gap-3 border-b border-border bg-muted/40 px-[18px] py-[9px] text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                >
                    <span className="min-w-0 flex-1">{main}</span>
                    <span>{end}</span>
                </div>
                <ul>{children}</ul>
            </div>
            {note ? (
                <p className="mt-2.5 max-w-[68ch] text-pretty text-[11.5px] leading-[1.45] text-muted-foreground">
                    {note}
                </p>
            ) : null}
        </div>
    );
}

/** One row. The whole row may be a link or button; pass it as `as`. */
export function ListRow({
    title,
    sub,
    tag,
    end,
    muted,
    className,
}: {
    title: ReactNode;
    sub?: ReactNode;
    /** A pill beside the title: "Unread", a state. */
    tag?: ReactNode;
    /** The right-hand column. */
    end?: ReactNode;
    /** A read notification, a disabled provider: the title steps back. */
    muted?: boolean;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "flex min-h-14 flex-wrap items-center gap-3 px-[18px] py-[13px]",
                className,
            )}
        >
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span
                        className={cn(
                            "text-[13.5px] font-medium",
                            muted && "text-muted-foreground",
                        )}
                    >
                        {title}
                    </span>
                    {tag}
                </div>
                {sub ? (
                    <p className="mt-[2px] text-pretty text-[11.5px] leading-[1.45] text-muted-foreground">
                        {sub}
                    </p>
                ) : null}
            </div>
            {end ? (
                <div className="flex shrink-0 items-center gap-2">{end}</div>
            ) : null}
        </div>
    );
}

import { cn } from "@saroh/ui/lib/utils";
import { ListTable, ListTableHead } from "@saroh/ui/list-table";
import type { ReactNode } from "react";

/*
 * An optional column between the title and the right-hand edge (the Pages
 * tab's Updated, #908). Fixed widths, the heading's and every row's alike, so
 * the column lines up whatever the end holds. Desk only: below `sm` there is
 * no room beside the title, and the page says the same thing in the row's
 * sub line instead.
 */
const MIDDLE = "hidden w-[88px] shrink-0 text-right sm:block";
const END_BESIDE_MIDDLE = "sm:w-[136px] sm:justify-end";

/**
 * The workspace design's list, in the one table look (`listTable`): one
 * bordered card, the head band of column headings, then a row per item with its title, a line under it, and whatever belongs
 * on the right. Providers and Notifications draw it; the column headings are
 * what make the right-hand edge scannable as "status" or "when".
 */
export function ListCard({
    main,
    middle,
    end,
    note,
    children,
    className,
}: {
    /** The left column's heading: "Provider", "Notification". */
    main: string;
    /** A column's heading between the two: "Updated". Desk only. */
    middle?: string;
    /** The right column's heading: "Status", "When". */
    end: string;
    /** A line under the card about what the list is. */
    note?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className={className}>
            <ListTable>
                <ListTableHead className="flex gap-3">
                    <span className="min-w-0 flex-1">{main}</span>
                    {middle ? <span className={MIDDLE}>{middle}</span> : null}
                    <span
                        className={cn(
                            middle && "text-right",
                            middle && END_BESIDE_MIDDLE,
                        )}
                    >
                        {end}
                    </span>
                </ListTableHead>
                <ul>{children}</ul>
            </ListTable>
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
    middle,
    end,
    muted,
    className,
}: {
    title: ReactNode;
    sub?: ReactNode;
    /** A pill beside the title: "Unread", a state. */
    tag?: ReactNode;
    /**
     * The cell under ListCard's `middle` heading. Desk only, so whatever it
     * says must also be in `sub` for a phone.
     */
    middle?: ReactNode;
    /** The right-hand column. */
    end?: ReactNode;
    /** A read notification, a disabled provider: the title steps back. */
    muted?: boolean;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "flex min-h-14 flex-wrap items-center gap-3 px-[14px] py-[11px]",
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
            {middle !== undefined ? (
                <div className={MIDDLE}>{middle}</div>
            ) : null}
            {end ? (
                <div
                    className={cn(
                        "flex shrink-0 items-center gap-2",
                        middle !== undefined && END_BESIDE_MIDDLE,
                    )}
                >
                    {end}
                </div>
            ) : null}
        </div>
    );
}

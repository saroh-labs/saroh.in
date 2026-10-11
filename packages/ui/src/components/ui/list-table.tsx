import * as React from "react";
import { cn } from "../../lib/utils";

/*
 * ONE TABLE LOOK.
 *
 * Every list in the workspace reads the same: a card with a hairline edge,
 * a tinted head band of small uppercase column names, rows ruled edge to
 * edge, figures right-aligned in tabular numerals, one row padding, one
 * hover wash and one pressed step.
 *
 * `DataView` draws its table from these. A screen that needs its own row
 * layout (cards on a phone, day groups, a column per location) takes the
 * same classes, so the band and the row rhythm cannot drift:
 *
 *   <ListTable>
 *     <ListTableHead className="grid grid-cols-[…]">…</ListTableHead>
 *     <ul>
 *       <li className={cn(listTable.row, "grid grid-cols-[…]")}>…</li>
 *     </ul>
 *   </ListTable>
 *
 * The side padding is on the head and on each row, never on a wrapper
 * around them: a padded wrapper is what insets the row rules from the
 * card's edges.
 */
export const listTable = {
    /** The frame: a hairline edge, the card's fill, corners that clip. */
    card: "overflow-hidden rounded-[11px] border border-border bg-card",
    /**
     * The frame for a list that scrolls sideways at the desk: the same
     * edge, without the clip its scroller needs to own.
     */
    frame: "rounded-[11px] border border-border bg-card",
    /** The head band: tinted, ruled below, `.label` type, 40px. */
    head: "label min-h-10 items-center border-b border-border bg-muted px-[14px] py-[9px]",
    /** The `<tr>` of a real `<table>`'s head band. */
    headRow: "h-10 border-b border-border bg-muted",
    /** A `<th>` in it. */
    th: "label whitespace-nowrap px-[14px] text-left",
    /** One row: ruled edge to edge, the one padding, the hover wash. */
    row: "border-b border-border px-[14px] py-[11px] transition-colors duration-fast last:border-b-0 hover:bg-foreground/[0.035]",
    /**
     * The same row without the wash, for one that holds a column that
     * stays put while the rest scroll (its own fill would break the wash),
     * or boxes to type in.
     */
    rowStill: "border-b border-border px-[14px] py-[11px] last:border-b-0",
    /**
     * The rule alone, for an `<li>` whose one child is the pressed row
     * (`rowInner`): `last:` has to count the list's items, not the
     * button inside each.
     */
    rule: "border-b border-border last:border-b-0",
    /** The padding and the wash, on the button or link inside `rule`. */
    rowInner:
        "px-[14px] py-[11px] transition-colors duration-fast hover:bg-foreground/[0.035]",
    /** The hover wash alone, for a row with a padding of its own. */
    wash: "transition-colors duration-fast hover:bg-foreground/[0.035]",
    /** The row whose quick look is open: a fill and an Ink edge. */
    selected:
        "bg-muted shadow-[inset_3px_0_0_hsl(var(--foreground))] hover:bg-muted",
    /** A `<tr>`: the rule and the wash. Its cells carry the padding. */
    tr: "border-b border-border transition-colors duration-fast last:border-b-0 hover:bg-foreground/[0.035]",
    /** A `<td>`. */
    td: "px-[14px] py-[11px] align-middle",
    /** On a row that is pressed as a whole (a link, a quick look). */
    pressable:
        "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-foreground/[0.07]",
    /** A column of figures, head and cells alike. */
    numeric: "text-right tabular-nums",
    /**
     * A time of day, or a day and a time: one line, however narrow the
     * column. "2:40" over "pm" is two facts where there is one.
     */
    time: "whitespace-nowrap tabular-nums",
    /**
     * A time column: one line, and wide enough for "12:30 pm" at 12px to
     * 13.5px type (58px at 13.5px Geist, with room to spare).
     */
    timeCol: "w-[68px] shrink-0 whitespace-nowrap tabular-nums",
    /** A group's heading inside the card (a day in a log): a quiet band. */
    group: "label border-b border-border px-[14px] pb-[7px] pt-[13px]",
} as const;

/** The list's card. `scroll` leaves the clip to a scroller inside it. */
export function ListTable({
    scroll = false,
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement> & { scroll?: boolean }) {
    return (
        <div
            data-list-table=""
            className={cn(scroll ? listTable.frame : listTable.card, className)}
            {...props}
        />
    );
}

/**
 * The head band of a list drawn as a grid or a flex row. Column names are
 * Saroh's own words, so a session recording may read them. It is hidden
 * from a screen reader unless it is given a role: the rows are a list and
 * each says what its parts are. Pass `role="row"` inside a real grid.
 */
export function ListTableHead({
    className,
    role,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            data-list-head=""
            data-ph-unmask=""
            role={role}
            aria-hidden={role ? undefined : true}
            className={cn(listTable.head, className)}
            {...props}
        />
    );
}
